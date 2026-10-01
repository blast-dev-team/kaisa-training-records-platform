export interface PaymentOrderDto {
  id: string
  order_no: string
  certificate_request_id: string | null
  trainee_id: string
  trainee_name?: string | null
  grade_name?: string | null
  cert_no?: string | null
  doc_count?: number
  first_course_name?: string | null
  amount_krw: number
  currency: string
  status: 'ready' | 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded'
  paid_at: string | null
  created_at: string
}
