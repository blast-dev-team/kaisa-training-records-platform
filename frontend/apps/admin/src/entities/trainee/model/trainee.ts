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
}

// ── 일괄 처리 ───────────────────────────────────────────────────────────────────

export interface TraineeBulkGradeInput {
  trainee_ids: string[]
  membership_grade_id: string
}

export interface TraineeBulkUpdateItem {
  id: string
  name?: string
  birth_date?: string
  /** 빈 값/생략 = 기존 번호 유지 */
  phone?: string
}

export interface TraineeBulkUpdateInput {
  items: TraineeBulkUpdateItem[]
}

export interface TraineeBulkResult {
  /** skipped = 없는/삭제된 id, 이미 같은 등급, 변경 필드 없는 항목 */
  updated: number
  skipped: number
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
