export type TraineeReviewStatus = 'unverified' | 'pending' | 'approved' | 'rejected'

export const TRAINEE_REVIEW_STATUS_LABELS: Record<TraineeReviewStatus, string> = {
  unverified: '미인증',
  pending: '심사중',
  approved: '승인',
  rejected: '거절',
}

export interface Trainee {
  id: string
  traineeNo: string
  /** 감리원증번호 */
  certNo: string | null
  /** 감리원 등급 (감리원/수석감리원) — 확인서 표기용. 회원등급(결제 단가)과 별개 */
  supervisorGrade: string | null
  name: string
  birthDate: string | null
  phoneMasked: string
  email: string | null
  reviewStatus: TraineeReviewStatus
  membershipGradeId: string | null
  gradeName: string | null
  /** 연간 등급 만료일 (YYYY-MM-DD) — 연간 외 등급은 null */
  gradeExpiresAt: string | null
  userId: string | null
  memo: string | null
  createdAt: string
  updatedAt: string
}

export interface TraineeUpdateInput {
  name?: string
  cert_no?: string | null
  supervisor_grade?: string | null
  birth_date?: string | null
  phone?: string
  email?: string | null
  memo?: string | null
  membership_grade_id?: string
  /** 연간 등급 만료일 — 연간 지정/연장 시 필수, 다른 등급이면 서버가 무시 */
  grade_expires_at?: string
  grade_change_reason?: string
}

export interface TraineeCreateInput {
  name: string
  cert_no?: string | null
  supervisor_grade?: string | null
  birth_date?: string | null
  phone?: string
  email?: string | null
  memo?: string | null
  membership_grade_id?: string
  /** 연간 등급 지정 시 만료일 필수(서버 검증) */
  grade_expires_at?: string
}

// ── 일괄 처리 ───────────────────────────────────────────────────────────────────

export interface TraineeBulkGradeInput {
  trainee_ids: string[]
  membership_grade_id: string
  /** 연간 선택 시 만료일(전원 동일 적용) */
  grade_expires_at?: string
}

export interface TraineeBulkUpdateItem {
  id: string
  name?: string
  birth_date?: string
  /** 빈 값/생략 = 기존 번호 유지 */
  phone?: string
  /** 빈 값/생략 = 기존 번호 유지 */
  cert_no?: string
}

export interface TraineeBulkUpdateInput {
  items: TraineeBulkUpdateItem[]
}

export interface TraineeBulkResult {
  /** skipped = 없는/삭제된 id, 이미 같은 등급, 변경 필드 없는 항목 */
  updated: number
  skipped: number
}

// ── 엑셀 일괄 등록 ───────────────────────────────────────────────────────────────

export interface TraineeImportRow {
  row_number: number
  name: string | null
  /** 숫자 정규화된 평문 — 프리뷰 편집용 */
  phone: string | null
  birth_date: string | null
  cert_no: string | null
  supervisor_grade: string | null
  cert_issued_date: string | null
  is_duplicate: boolean
  duplicate_of_name: string | null
  /** 비어 있어야 등록 가능한 행 (감리원명 누락, 날짜 파싱 실패 등) */
  errors: string[]
}

export interface TraineeImportPreviewResult {
  rows: TraineeImportRow[]
  total: number
}

export interface TraineeImportConfirmItem {
  row_number: number
  name: string
  phone?: string | null
  birth_date?: string | null
  cert_no?: string | null
  supervisor_grade?: string | null
  cert_issued_date?: string | null
}

export interface TraineeImportFailure {
  row_number: number
  error: string
}

export interface TraineeImportResult {
  /** skipped = 확정 시점 재판정에서 중복으로 걸러진 행 */
  created: number
  skipped: number
  failed: TraineeImportFailure[]
}

// ── 회원등급 마스터 ───────────────────────────────────────────────────────────

export interface MembershipGrade {
  id: string
  code: string
  name: string
  description: string | null
  sortOrder: number
  priceKrw: number
  isActive: boolean
  createdAt: string
}

export interface MembershipGradeCreateInput {
  code: string
  name: string
  description?: string
  sort_order: number
  price_krw: number
}

export interface MembershipGradeUpdateInput {
  name?: string
  description?: string
  sort_order?: number
  price_krw?: number
  is_active?: boolean
}
