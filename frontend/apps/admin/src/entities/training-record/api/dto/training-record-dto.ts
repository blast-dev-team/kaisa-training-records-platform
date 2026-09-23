export interface TrainingRecordDto {
  id: string
  trainee_id: string
  trainee_name: string | null
  trainee_no: string | null
  trainee_cert_no: string | null
  trainee_birth_date: string | null
  trainee_phone: string | null
  course_id: string | null
  session_id: string | null
  institution_id: string | null
  /** internal | external | null(미선택) — institution 조인 값, 수료증 발급 자격 판정용 */
  institution_type?: string | null
  course_name: string
  institution_name: string | null
  supervisor_grade: string | null
  supervisor_cert_no: string | null
  total_hours: string | number | null
  completed_hours: string | number | null
  started_at: string | null
  ended_at: string | null
  source: 'internal' | 'external' | 'legacy_import'
  completion_status: 'in_progress' | 'completed' | 'canceled'
  memo: string | null
  created_at: string
  updated_at: string
}
