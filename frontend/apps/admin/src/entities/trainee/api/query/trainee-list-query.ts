export interface TraineeListQuery {
  /** 검색어 (URL 표준키 q → API search) */
  q?: string
  reviewStatus?: string
  gradeId?: string
  page?: number
  limit?: number
}
