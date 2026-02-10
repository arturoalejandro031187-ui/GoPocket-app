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
   * Deduce fondos (Débito) del wallet de un usuario.
   */
  static async deductFunds(
    userId: string,
    amount: number,
    concept: string,
    refType: WalletReferenceType,
    refId?: string
  ): Promise<WalletTransaction> {
    if (amount <= 0) throw new Error('El monto a deducir debe ser positivo.');

    const wallet = await this.getOrCreateWallet(userId);
    if (wallet.balance < amount) {
        throw new Error('Saldo insuficiente.');
    }
    const newBalance = Number(wallet.balance) - amount;

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
        type: 'debit',
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
   * Procesa el pago de múltiples órdenes.
   * Reemplaza el RPC para tener control total sobre la lógica y evitar errores opacos.
   * Retorna el nuevo saldo.
   */
  static async payOrdersBatch(userId: string, orders: { id: string; amount: number }[]): Promise<number> {
    if (orders.length === 0) {
      const w = await this.getOrCreateWallet(userId);
      return Number(w.balance);
    }

    const totalAmount = orders.reduce((sum, o) => sum + o.amount, 0);
    const admin = supabaseAdmin();

    // 1. Obtener wallet y validar saldo
    const wallet = await this.getOrCreateWallet(userId);
    if (Number(wallet.balance) < totalAmount) {
      throw new Error(`Saldo insuficiente. Requerido: $${totalAmount}, Disponible: $${wallet.balance}`);
    }

    // 2. Descontar saldo (Update Wallet)
    const newBalance = Number(wallet.balance) - totalAmount;
    const { error: updateError } = await admin
      .from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(`Error actualizando saldo: ${updateError.message}`);
    }

    // 3. Registrar transacciones (Insert Many)
    const transactions = orders.map(o => ({
      wallet_id: userId,
      type: 'debit',
      amount: o.amount,
      concept: `Pago de orden #${o.id.slice(0, 8)}`,
      reference_type: 'order',
      reference_id: o.id,
      created_at: new Date().toISOString()
    }));

    const { error: insertError } = await admin
      .from('wallet_transactions')
      .insert(transactions);

    if (insertError) {
      console.error('[WalletService] Error insertando transacciones (saldo ya descontado):', insertError);
      // No lanzamos error aquí para no interrumpir el flujo crítico, ya que el dinero ya se cobró.
      // En un sistema ideal, esto debería ser una transacción de BD rollbackeable.
    }

    return newBalance;
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
        .select('buyer_id, seller_id, total, subtotal, payment_method, created_at')
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

      // 3. Calcular Cashback Dinámico (Global + Tienda)
      const [settingsRes, sellerRes] = await Promise.all([
        admin.from('app_settings').select('*').single(),
        admin.from('profiles').select('store_cashback_enabled, store_cashback_percent').eq('id', ordDetails.seller_id).single()
      ]);

      const settings = settingsRes.data;
      const seller = sellerRes.data;
      const baseAmount = Number(ordDetails.subtotal) || Number(ordDetails.total) || 0;
      const orderDate = new Date(ordDetails.created_at);
      
      let globalAmount = 0;
      let storeAmount = 0;
      let globalPct = 0;
      let storePct = 0;

      // A. Global Cashback
      if (settings?.cashback_enabled) {
         const start = settings.cashback_start_date ? new Date(settings.cashback_start_date) : null;
         const end = settings.cashback_end_date ? new Date(settings.cashback_end_date) : null;
         const isActive = (!start || orderDate >= start) && (!end || orderDate <= end);
         
         if (isActive) {
             globalPct = Number(settings.cashback_percent) || 0;
             if (globalPct > 0) {
                 globalAmount = Number((baseAmount * (globalPct / 100)).toFixed(2));
             }
         }
      }

      // B. Store Cashback
      if (seller?.store_cashback_enabled) {
          storePct = Number(seller.store_cashback_percent) || 0;
          if (storePct > 0) {
              storeAmount = Number((baseAmount * (storePct / 100)).toFixed(2));
          }
      }

      const totalAmount = globalAmount + storeAmount;
      
      if (totalAmount <= 0) {
        return 0;
      }

      const descParts = [];
      if (globalAmount > 0) descParts.push(`Global ${globalPct}%`);
      if (storeAmount > 0) descParts.push(`Tienda ${storePct}%`);

      // 4. Agregar fondos
      await this.addFunds(
        ordDetails.buyer_id,
        totalAmount,
        `Cashback (${descParts.join(' + ')}) por compra #${orderId.slice(0, 8)}`,
        'cashback',
        orderId
      );

      return totalAmount;
    } catch (err) {
      console.error(`[WalletService] Error processing cashback for order ${orderId}:`, err);
      return 0;
    }
  }

  /**
   * Obtiene las transacciones de un usuario.
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
