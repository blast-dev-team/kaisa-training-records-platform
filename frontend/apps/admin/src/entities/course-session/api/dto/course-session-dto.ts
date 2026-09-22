export interface CourseSessionDto {
  id: string
  course_id: string
  course_name: string
  institution_id: string
  institution_name: string
  schedule_no: number | null
  started_at: string | null
  ended_at: string | null
  total_hours: string | number | null
  recognized_hours: string | number | null
  is_active: boolean
  memo: string | null
  enrolled_count: number
  created_at: string
  updated_at: string
}
