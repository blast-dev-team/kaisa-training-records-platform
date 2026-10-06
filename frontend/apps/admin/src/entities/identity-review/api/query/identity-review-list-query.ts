export interface IdentityReviewListQuery {
  status?: string
  search?: string
  /** 정렬 필드 — created_at(신청일시) | reviewed_at(처리일시). 기본 created_at */
  sort?: string
  /** asc | desc. 기본 desc */
  order?: string
  page?: number
  limit?: number
}
