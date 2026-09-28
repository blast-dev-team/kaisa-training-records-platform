export interface CourseSessionListQuery {
  courseId?: string
  /** 과정명 · 기관명 검색 */
  q?: string
  /** 상태 필터 — active: 운영중(종료일 미경과), ended: 종료(비활성 또는 기간 경과) */
  status?: 'active' | 'ended'
  /** 교육 기간 겹침 필터 (from ~ to) */
  dateFrom?: string
  dateTo?: string
  /** 목록 정렬 — period=일정순(시작일 최신, 기본) · registration=등록순 */
  sort?: 'period' | 'registration'
  page?: number
  limit?: number
}
