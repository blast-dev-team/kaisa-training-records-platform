export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'manual_review'

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: '대기',
  approved: '승인',
  rejected: '거절',
  manual_review: '수동심사',
}

export interface IdentityReview {
  id: string
  identityVerificationId: string
  userId: string
  userName: string
  traineeId: string | null
  verifiedName: string
  verifiedPhoneMasked: string
  status: ReviewStatus
  matchedBy: string | null
  determinedGradeId: string | null
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
}

export interface ReviewApproveInput {
  /** 화면에서 검색·대조한 교육생. 생략 불가 */
  trainee_id: string
  /** 생략 시 서버가 기본 등급 조회 → 없으면 GRADE_NOT_DETERMINED 409 */
  determined_grade_id?: string
}

export interface ReviewRejectInput {
  review_note: string
}
