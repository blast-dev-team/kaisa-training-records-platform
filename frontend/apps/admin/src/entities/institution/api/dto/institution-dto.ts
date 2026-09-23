export interface InstitutionDto {
  id: string
  name: string
  institution_code: string | null
  /** internal | external | null(미선택) — internal 만 수료증 발급 가능 */
  institution_type?: string | null
  is_active: boolean
  created_at: string
}

export interface CourseDto {
  id: string
  institution_id: string
  institution_name: string | null
  session_name_id: string | null
  session_name: string | null
  is_external: boolean
  name: string
  course_code: string | null
  description: string | null
  total_hours: string | number | null
  category: string | null
  is_active: boolean
  created_at: string
}
