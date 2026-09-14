export interface Institution {
  id: string
  name: string
  institutionCode: string | null
  isActive: boolean
  createdAt: string
}

export interface InstitutionInput {
  name: string
  institution_code?: string
  is_active?: boolean
}

export interface Course {
  id: string
  institutionId: string
  institutionName: string | null
  name: string
  courseCode: string | null
  description: string | null
  totalHours: number | null
  category: string | null
  isActive: boolean
  createdAt: string
}

export interface CourseInput {
  institution_id: string
  name: string
  course_code?: string
  description?: string | null
  total_hours: number
  category?: string | null
  is_active?: boolean
}
