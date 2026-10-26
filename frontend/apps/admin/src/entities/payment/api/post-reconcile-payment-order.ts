import { apiClient } from '@/src/shared/api'
import type { PaymentOrderDto } from './dto/payment-order-dto'
import { mapPaymentOrder } from './map-payment-order'
import type { PaymentOrder } from '../model/payment-order'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_PAYMENT_ORDERS } from './payment-mock'

/** issued(발급됨) / closed(미결제로 닫음) / pending(아직 결제 대기) / error */
export type ReconcileOutcome = 'issued' | 'closed' | 'pending' | 'error'

export interface ReconcileResult {
  outcome: ReconcileOutcome
  message: string | null
  order: PaymentOrder
}

interface ReconcileDto {
  outcome: ReconcileOutcome
  message: string | null
  order: PaymentOrderDto
}

/**
 * PortOne 재조회 — "결제했는데 확인서가 안 나왔어요" 문의 대응.
 * 결제됐으면 서버가 바로 발급한다. 30분 안 된 대기 주문은 닫지 않는다(회원이 결제 중일 수 있음).
 */
export const postReconcilePaymentOrder = async (orderId: string): Promise<ReconcileResult> => {
  if (USE_MOCK) {
    await mockDelay()
    const order = MOCK_PAYMENT_ORDERS.find((p) => p.id === orderId)
    if (!order) throw new Error('결제 주문을 찾을 수 없어요')
    return { outcome: 'pending', message: '아직 결제가 완료되지 않았어요', order: { ...order } }
  }
  const { data } = await apiClient.post<ReconcileDto>(`/payment-orders/${orderId}/reconcile`)
  return { outcome: data.outcome, message: data.message, order: mapPaymentOrder(data.order) }
}
