import { apiClient } from '@/src/shared/api'
import type { PaymentOrderDto } from './dto/payment-order-dto'
import { mapPaymentOrder } from './map-payment-order'
import type { PaymentOrder } from '../model/payment-order'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_PAYMENT_ORDERS } from './payment-mock'

/** 결제 환불 — 사유 필수, 감사로그 자동 기록 */
export const postRefundPaymentOrder = async (
  orderId: string,
  reason: string,
): Promise<PaymentOrder> => {
  if (USE_MOCK) {
    await mockDelay()
    const order = MOCK_PAYMENT_ORDERS.find(p => p.id === orderId)
    if (!order) throw new Error('결제 주문을 찾을 수 없어요')
    order.status = 'refunded'
    void reason // 감사로그 기록은 실API 연동 시 서버가 담당
    return { ...order }
  }
  const { data } = await apiClient.post<PaymentOrderDto>(
    `/payment-orders/${orderId}/refunds`,
    { reason },
  )
  return mapPaymentOrder(data)
}
