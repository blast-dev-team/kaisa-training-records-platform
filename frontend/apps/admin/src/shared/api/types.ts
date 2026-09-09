/** 백엔드 에러 응답 원형 — `{code, message}` (docs/admin/api.md §1) */
export interface ApiErrorBody {
  code: string
  message: string
  errors?: { field: string; message: string }[]
}

/** 서버 페이지네이션 응답 (docs/admin/api.md §1 PagedResponse) */
export interface PagedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  total_pages: number
}

/** PagedResponse를 FE 공통 형태로 정규화한 결과 */
export interface Paged<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}
