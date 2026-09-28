export interface InstitutionListQuery {
  q?: string
  isActive?: boolean
  /** internal | external — 기관 구분 필터 */
  institutionType?: string
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
