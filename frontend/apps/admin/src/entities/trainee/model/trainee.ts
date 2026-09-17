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
  birth_date?: string | null
  phone?: string
  email?: string | null
  memo?: string | null
  membership_grade_id?: string
  grade_change_reason?: string
}

export interface TraineeCreateInput {
  name: string
  birth_date?: string | null
  phone?: string
  email?: string | null
  memo?: string | null
  membership_grade_id?: string
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
