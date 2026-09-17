export interface CertificateDto {
  id: string
  certificate_no: string
  certificate_request_id: string | null
  trainee_id: string
  training_record_id: string
  payment_order_id: string | null
  issued_name: string
  course_name: string
  institution_name: string | null
  total_hours: string | number | null
  completed_hours: string | number | null
  training_started_at: string | null
  training_ended_at: string | null
  issued_at: string | null
  expires_at: string | null
  status: 'issued' | 'revoked' | 'superseded'
  revoked_at: string | null
  revoked_reason: string | null
}

