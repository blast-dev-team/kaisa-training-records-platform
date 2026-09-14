export interface InstitutionDto {
  id: string
  name: string
  institution_code: string | null
  is_active: boolean
  created_at: string
}

export interface CourseDto {
  id: string
  institution_id: string
  institution_name: string | null
  name: string
  course_code: string | null
  description: string | null
  total_hours: number | null
  category: string | null
  is_active: boolean
  created_at: string
}
