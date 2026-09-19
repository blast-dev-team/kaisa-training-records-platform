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
  sessionNameId: string | null
  sessionName: string | null
  /** 외부 교육과정 — 감리원 개인 수료 외부 교육 */
  isExternal: boolean
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
  session_name_id?: string | null
  is_external?: boolean
  course_code?: string
  description?: string | null
  total_hours: number
  category?: string | null
  is_active?: boolean
}

export interface SessionName {
  id: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface SessionNameInput {
  name: string
  is_active?: boolean
}
