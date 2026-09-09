export interface TrainingRecordDto {
  id: string
  trainee_id: string
  trainee_name: string | null
  trainee_no: string | null
  course_id: string | null
  institution_id: string | null
  course_name: string
  institution_name: string | null
  total_hours: number | null
  completed_hours: number | null
  started_at: string | null
  ended_at: string | null
  source: 'internal' | 'external' | 'legacy_import'
  completion_status: 'in_progress' | 'completed' | 'canceled'
  memo: string | null
  created_at: string
  updated_at: string
}
