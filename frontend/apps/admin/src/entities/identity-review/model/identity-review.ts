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

/** 검색·대조로 매칭할 교육생이 없을 때 — 모달에서 새로 생성해 연결 */
export interface NewTraineeInput {
  name: string
  /** 평문 수신 — 서버가 암호화 저장 */
  phone?: string
  email?: string
}

export interface ReviewApproveInput {
  /** 기존 교육생 연결 — new_trainee 와 정확히 하나만 */
  trainee_id?: string
  /** 신규 교육생 생성·연결 — 이때는 determined_grade_id 필수 */
  new_trainee?: NewTraineeInput
  /** 생략 시 기존 교육생은 현재 등급 유지. 신규 생성 시 필수 */
  determined_grade_id?: string
}

export interface ReviewRejectInput {
  review_note: string
}
