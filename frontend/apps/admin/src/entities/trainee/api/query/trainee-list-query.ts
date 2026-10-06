export interface TraineeListQuery {
  /** 검색어 (URL 표준키 q → API search) — 성명(전체일치)·감리원증번호·교육번·이메일 */
  q?: string
  reviewStatus?: string
  /** 회원등급 (결제 단가) */
  gradeId?: string
  /** 감리원 등급 — 'none' = 미정(NULL) */
  supervisorGrade?: string
  /** 생년월일 단일 날짜 일치 (YYYY-MM-DD) */
  birthDate?: string
  /** 정렬 키 — 연간 만료일 / 등록일 / 수정일 */
  sort?: 'grade_expires_at' | 'created_at' | 'updated_at'
  /** 정렬 방향 — asc = 만료 임박순 */
  order?: 'asc' | 'desc'
  page?: number
  limit?: number
}
