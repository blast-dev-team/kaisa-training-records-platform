export interface TrainingRecordDto {
  id: string
  trainee_id: string
  trainee_name: string | null
  trainee_no: string | null
  course_id: string | null
  institution_id: string | null
  course_name: string
  institution_name: string | null
  form_no: string | null
  doc_no: string | null
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
