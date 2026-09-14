import { apiClient } from '@/src/shared/api'
import type { PaymentOrderDto } from './dto/payment-order-dto'
import { mapPaymentOrder } from './map-payment-order'
import type { PaymentOrder } from '../model/payment-order'

/** 결제 환불 — 사유 필수, 감사로그 자동 기록 */
export const postRefundPaymentOrder = async (
  orderId: string,
  reason: string,
): Promise<PaymentOrder> => {
  const { data } = await apiClient.post<PaymentOrderDto>(
    `/payment-orders/${orderId}/refunds`,
    { reason },
  )
  return mapPaymentOrder(data)
}
