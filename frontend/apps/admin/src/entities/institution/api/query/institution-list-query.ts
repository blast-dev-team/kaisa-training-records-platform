export interface InstitutionListQuery {
  q?: string
  isActive?: boolean
}

export interface CourseListQuery {
  institutionId?: string
  isActive?: boolean
}
