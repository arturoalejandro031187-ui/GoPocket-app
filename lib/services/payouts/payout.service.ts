// Servicio de lógica de negocio para payouts

import { PayoutsRepository } from '@/lib/repositories/payouts.repository';
import { OrdersRepository } from '@/lib/repositories/orders.repository';
import { PayoutBalance, Order } from '@/lib/types/domain.types';
import { ValidationError, NotFoundError } from '@/lib/utils/errors';
import { validateRequired, validateUUID } from '@/lib/utils/validation';
import { payoutNet, isCancelledStatus, isPaidStatus, isReleasedStatus, toNumber } from '@/lib/payouts/calc';

export interface CalculateBalanceParams {
  sellerId: string;
}

export interface WithdrawParams {
  sellerId: string;
  accessToken: string;
}

export interface WithdrawResult {
  withdrawalId: string;
  amountMxn: number;
  mpTransferId?: string;
  message: string;
}

export class PayoutService {
  constructor(
    private payoutsRepo: PayoutsRepository,
    private ordersRepo: OrdersRepository
  ) {}

  /**
   * Calcular balance del vendedor
   */
  async calculateBalance(params: CalculateBalanceParams): Promise<PayoutBalance> {
    const { sellerId } = params;

    validateRequired(sellerId, 'sellerId');
    if (!validateUUID(sellerId)) {
      throw new ValidationError('sellerId debe ser un UUID válido');
    }

    // Obtener órdenes
    const orders = await this.payoutsRepo.findAllOrdersBySeller(sellerId);

    // Obtener disputas y retiros
    const disputedOrderIds = await this.payoutsRepo.findDisputedOrderIds(sellerId);
    const withdrawnOrderIds = await this.payoutsRepo.findWithdrawnOrderIds(sellerId);
    const disputedSet = new Set(disputedOrderIds);
    const withdrawnSet = new Set(withdrawnOrderIds);

    // Obtener deducción por guías
    const guideDeduction = await this.payoutsRepo.getGuideDeduction(sellerId);

    // Filtrar órdenes activas
    const activeOrders = orders.filter((o) => !isCancelledStatus(String(o?.status ?? '')));
    const releasedOrders = activeOrders.filter((o) => isReleasedStatus(String(o?.status ?? '')));
    const paidNotReleasedOrders = activeOrders.filter(
      (o) => isPaidStatus(String(o?.status ?? '')) && !isReleasedStatus(String(o?.status ?? ''))
    );

    // Calcular disponible
    let disponible = 0;
    const disponiblesOrderIds: string[] = [];
    for (const o of activeOrders) {
      const id = String(o?.id ?? '').trim();
      if (!id) continue;
      if (withdrawnSet.has(id) || disputedSet.has(id)) continue;
      if (!o?.paid_to_seller_at) continue;
      const st = String(o?.status ?? '').toLowerCase();
      if (['cancelled', 'canceled', 'refunded'].includes(st)) continue;
      disponible += payoutNet(o);
      disponiblesOrderIds.push(id);
    }
    disponible = Math.max(0, disponible - guideDeduction);

    // Calcular por liberar
    let por_liberar = 0;
    for (const o of releasedOrders) {
      const id = String(o?.id ?? '').trim();
      if (!id || o?.paid_to_seller_at || withdrawnSet.has(id) || disputedSet.has(id)) continue;
      por_liberar += payoutNet(o);
    }
    por_liberar = Math.max(0, por_liberar);

    // Calcular estimado
    let estimado = 0;
    for (const o of paidNotReleasedOrders) {
      const id = String(o?.id ?? '').trim();
      if (!id || withdrawnSet.has(id) || disputedSet.has(id)) continue;
      estimado += payoutNet(o);
    }
    estimado = Math.max(0, estimado);

    // Verificar cuenta de MercadoPago
    const hasMercadoPago = await this.payoutsRepo.hasMercadoPagoAccount(sellerId);
    const can_withdraw = disponiblesOrderIds.length > 0 && disponible >= 0.01 && hasMercadoPago;

    return {
      disponible: Math.round(disponible * 100) / 100,
      por_liberar: Math.round(por_liberar * 100) / 100,
      estimado: Math.round(estimado * 100) / 100,
      can_withdraw: !!can_withdraw,
      mercadopago_configured: !!hasMercadoPago,
      orders_disponible: disponiblesOrderIds.length,
      guide_deduction: Math.round(guideDeduction * 100) / 100,
    };
  }

  /**
   * Procesar retiro
   */
  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
    const { sellerId, accessToken } = params;

    validateRequired(sellerId, 'sellerId');
    validateRequired(accessToken, 'accessToken');

    if (!validateUUID(sellerId)) {
      throw new ValidationError('sellerId debe ser un UUID válido');
    }

    // Verificar cuenta de MercadoPago
    const mpAccount = await this.payoutsRepo.getMercadoPagoAccount(sellerId);
    if (!mpAccount) {
      throw new ValidationError(
        'Agrega tu cuenta de Mercado Pago en Mi perfil → Datos de cobro para poder retirar.'
      );
    }

    // Obtener órdenes disponibles
    const orders = await this.payoutsRepo.findOrdersWithPaidToSeller(sellerId);
    const disputedOrderIds = await this.payoutsRepo.findDisputedOrderIds(sellerId);
    const withdrawnOrderIds = await this.payoutsRepo.findWithdrawnOrderIds(sellerId);
    const disputedSet = new Set(disputedOrderIds);
    const withdrawnSet = new Set(withdrawnOrderIds);

    // Filtrar candidatos
    const candidates = orders.filter((o) => {
      const id = String(o?.id ?? '').trim();
      if (!id) return false;
      if (withdrawnSet.has(id)) return false;
      if (disputedSet.has(id)) return false;
      const st = String(o?.status ?? '').toLowerCase();
      if (['cancelled', 'canceled', 'refunded'].includes(st)) return false;
      return true;
    });

    // Calcular total
    let total = 0;
    for (const o of candidates) {
      total += payoutNet(o);
    }

    // Obtener deducción por guías
    const guideDeduction = await this.payoutsRepo.getGuideDeduction(sellerId);
    const amountMxn = Math.max(0, total - guideDeduction);

    if (amountMxn < 0.01) {
      throw new ValidationError(
        'No hay saldo disponible para retirar. Confirma que el comprador haya marcado "Recibido" en las órdenes entregadas.'
      );
    }

    const orderIds = candidates.map((o) => String(o?.id ?? '').trim()).filter(Boolean);
    const amountCents = Math.round(amountMxn * 100);

    // Crear registro de retiro
    const withdrawal = await this.payoutsRepo.createWithdrawal({
      seller_id: sellerId,
      amount_cents: amountCents,
      order_ids: orderIds,
      status: 'pending',
    });

    // Procesar transferencia a MercadoPago
    const { transferToMercadoPagoUser } = await import('@/lib/mercadopago/transfer');
    const transfer = await transferToMercadoPagoUser({
      accessToken,
      amountMxn,
      recipientEmail: mpAccount,
      description: `GoPocket retiro · ${orderIds.length} venta(s)`,
    });

    // Actualizar estado del retiro
    if (transfer.ok) {
      await this.payoutsRepo.updateWithdrawal(withdrawal.id, {
        status: 'completed',
        mp_transfer_id: transfer.mp_transfer_id,
      });
      return {
        withdrawalId: withdrawal.id,
        amountMxn,
        mpTransferId: transfer.mp_transfer_id,
        message: 'Transferencia enviada a tu cuenta de Mercado Pago.',
      };
    } else {
      const errMsg = 'error' in transfer ? transfer.error : 'Error desconocido';
      await this.payoutsRepo.updateWithdrawal(withdrawal.id, {
        status: 'failed',
        error_message: errMsg,
      });
      throw new Error(`No se pudo completar la transferencia: ${errMsg}. El retiro quedó registrado como fallido.`);
    }
  }
}
