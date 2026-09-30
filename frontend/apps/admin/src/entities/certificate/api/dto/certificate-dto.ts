export interface CertificateDto {
  id: string
  certificate_no: string
  bundle_no: string | null
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
  /** 발급 경로 — 'member'(WEB 신청·결제) | 'admin'(어드민 발급 저장) */
  issue_source: 'member' | 'admin'
  downloaded_at: string | null
  download_count: string | number | null
  revoked_at: string | null
  revoked_reason: string | null
  /** 이 발급(묶음)에 담긴 교육내역 수 — 단건 1 */
  member_count: string | number
}

