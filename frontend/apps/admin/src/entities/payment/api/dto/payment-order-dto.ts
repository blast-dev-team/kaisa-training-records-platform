export interface PaymentOrderDto {
  id: string
  order_no: string
  certificate_request_id: string | null
  trainee_id: string
  amount_krw: number
  currency: string
  status: 'ready' | 'pending' | 'paid' | 'failed' | 'canceled' | 'partial_refunded' | 'refunded'
  paid_at: string | null
  created_at: string
}
