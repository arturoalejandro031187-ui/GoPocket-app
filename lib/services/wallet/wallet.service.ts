import { supabaseAdmin } from '@/lib/supabase/admin';
import { Wallet, WalletTransaction, WalletReferenceType } from '@/lib/types/wallet.types';

export class WalletService {
  /**
   * Obtiene el wallet de un usuario. Retorna null si no existe.
   */
  static async getWallet(userId: string): Promise<Wallet | null> {
    const { data, error } = await supabaseAdmin()
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return data as Wallet;
  }

  /**
   * Crea un wallet para un usuario con saldo 0.
   */
  static async createWallet(userId: string): Promise<Wallet> {
    const { data, error } = await supabaseAdmin()
      .from('wallets')
      .insert({ user_id: userId, balance: 0 })
      .select()
      .single();
    if (error) throw error;
    return data as Wallet;
  }

  /**
   * Obtiene el wallet o lo crea si no existe.
   */
  static async getOrCreateWallet(userId: string): Promise<Wallet> {
    let wallet = await this.getWallet(userId);
    if (!wallet) {
      wallet = await this.createWallet(userId);
    }
    return wallet;
  }

  /**
   * Agrega fondos (Crédito) al wallet de un usuario.
   */
  static async addFunds(
    userId: string,
    amount: number,
    concept: string,
    refType: WalletReferenceType,
    refId?: string
  ): Promise<WalletTransaction> {
    if (amount <= 0) throw new Error('El monto debe ser positivo.');

    const wallet = await this.getOrCreateWallet(userId);
    const newBalance = Number(wallet.balance) + amount;

    // Actualizar saldo
    const { error: updateError } = await supabaseAdmin()
      .from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    
    if (updateError) throw updateError;

    // Registrar transacción
    const { data: txn, error: txnError } = await supabaseAdmin()
      .from('wallet_transactions')
      .insert({
        wallet_id: userId,
        type: 'credit',
        amount: amount,
        concept,
        reference_type: refType,
        reference_id: refId
      })
      .select()
      .single();

    if (txnError) throw txnError;
    return txn as WalletTransaction;
  }

  /**
   * Descuenta fondos (Débito) del wallet de un usuario.
   * Lanza error si no hay saldo suficiente.
   */
  static async deductFunds(
    userId: string,
    amount: number,
    concept: string,
    refType: WalletReferenceType,
    refId?: string
  ): Promise<WalletTransaction> {
    if (amount <= 0) throw new Error('El monto debe ser positivo.');

    // Usar función RPC atómica para prevenir condiciones de carrera (double spending)
    const { data: result, error: rpcError } = await supabaseAdmin()
      .rpc('deduct_wallet_funds', {
        p_user_id: userId,
        p_amount: amount,
        p_concept: concept,
        p_ref_type: refType,
        p_ref_id: refId
      });

    if (rpcError) {
      // Manejar errores conocidos de la función SQL
      if (rpcError.message.includes('Saldo insuficiente')) {
        throw new Error(rpcError.message); // Mantener mensaje original del RPC
      }
      if (rpcError.message.includes('Wallet is frozen') || rpcError.message.includes('congelado')) {
        throw new Error('El monedero está congelado.');
      }
      throw new Error(`Error al procesar pago: ${rpcError.message}`);
    }

    const { transaction_id } = result as any;

    // Recuperar la transacción creada para devolverla (mantener compatibilidad)
    const { data: txn, error: txnError } = await supabaseAdmin()
      .from('wallet_transactions')
      .select('*')
      .eq('id', transaction_id)
      .single();

    if (txnError) throw txnError;
    return txn as WalletTransaction;
  }

  /**
   * Procesa el pago de múltiples órdenes en una sola transacción atómica.
   * Si falla (saldo insuficiente, error), no se descuenta nada.
   */
  static async payOrdersBatch(userId: string, orders: { id: string; amount: number }[]): Promise<void> {
    if (orders.length === 0) return;

    const transactions = orders.map(o => ({
      amount: o.amount,
      concept: `Pago de orden #${o.id.slice(0, 8)}`,
      ref_type: 'order',
      ref_id: o.id
    }));

    const { data: result, error: rpcError } = await supabaseAdmin()
      .rpc('deduct_wallet_batch', {
        p_user_id: userId,
        p_transactions: transactions
      });

    if (rpcError) {
       throw new Error(`Error en pago por lote: ${rpcError.message}`);
    }

    const res = result as any;
    if (!res.success) {
      throw new Error(res.message || 'Error procesando el pago.');
    }
  }

  /**
   * Procesa el cashback para una orden completada/entregada.
   * Verifica configuraciones y si ya se otorgó antes.
   */
  static async processOrderCashback(orderId: string): Promise<number> {
    try {
      const admin = supabaseAdmin();
      
      // 1. Obtener detalles de la orden
      const { data: ordDetails } = await admin
        .from('orders')
        .select('buyer_id, total, payment_method')
        .eq('id', orderId)
        .maybeSingle();

      if (!ordDetails || !ordDetails.buyer_id || (ordDetails.total || 0) <= 0) {
        return 0;
      }

      // Si pagó con PocketCash, no genera cashback
      if (ordDetails.payment_method === 'pocketcash') {
        return 0;
      }

      // 2. Verificar si ya se otorgó cashback para esta orden
      const { data: existingTx } = await admin
        .from('wallet_transactions')
        .select('id')
        .eq('reference_type', 'cashback')
        .eq('reference_id', orderId)
        .maybeSingle();

      if (existingTx) {
        // Ya se otorgó
        return 0;
      }

      // 3. Obtener configuración de Cashback
      const { data: settings } = await admin
        .from('app_settings')
        .select('cashback_config')
        .eq('id', 1)
        .maybeSingle();

      const config = settings?.cashback_config as { enabled: boolean; percentage: number } | null;

      if (!config?.enabled || config.percentage <= 0) {
        return 0;
      }

      // 4. Calcular monto
      const amount = Number(((ordDetails.total || 0) * (config.percentage / 100)).toFixed(2));
      
      if (amount <= 0) {
        return 0;
      }

      // 5. Agregar fondos
      await this.addFunds(
        ordDetails.buyer_id,
        amount,
        `Cashback por compra #${orderId.slice(0, 8)}`,
        'cashback',
        orderId
      );

      return amount;
    } catch (err) {
      console.error(`[WalletService] Error processing cashback for order ${orderId}:`, err);
      return 0;
    }
  }

  /**
   * Obtiene las últimas transacciones de un usuario.
   */
  static async getTransactions(userId: string, limit = 50): Promise<WalletTransaction[]> {
    const { data, error } = await supabaseAdmin()
      .from('wallet_transactions')
      .select('*')
      .eq('wallet_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data as WalletTransaction[];
  }
}
