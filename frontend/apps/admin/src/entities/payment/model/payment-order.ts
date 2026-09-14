export type PaymentStatus =
  | 'ready'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'canceled'
  | 'partial_refunded'
  | 'refunded'

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  ready: '준비',
  pending: '결제대기',
  paid: '결제완료',
  failed: '실패',
  canceled: '취소',
  partial_refunded: '부분환불',
  refunded: '환불',
}

export interface PaymentOrder {
  id: string
  orderNo: string
  certificateRequestId: string | null
  traineeId: string
  amountKrw: number
  currency: string
  status: PaymentStatus
  paidAt: string | null
  createdAt: string
}
