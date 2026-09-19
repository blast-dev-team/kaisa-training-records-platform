export interface InstitutionListQuery {
  q?: string
  isActive?: boolean
  page?: number
  limit?: number
}

export interface CourseListQuery {
  institutionId?: string
  isActive?: boolean
  search?: string
  category?: string
  /** 외부 교육과정 필터 */
  isExternal?: boolean
  page?: number
  limit?: number
}

export interface SessionNameListQuery {
  q?: string
  isActive?: boolean
  page?: number
  limit?: number
}
