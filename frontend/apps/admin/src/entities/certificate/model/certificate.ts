import type { CompletionStatus } from '@/src/entities/training-record'

export type CertificateStatus = 'issued' | 'revoked' | 'superseded'

export const CERTIFICATE_STATUS_LABELS: Record<CertificateStatus, string> = {
  issued: '발급됨',
  revoked: '철회',
  superseded: '대체',
}

export interface Certificate {
  id: string
  certificateNo: string
  certificateRequestId: string | null
  traineeId: string
  trainingRecordId: string
  paymentOrderId: string | null
  issuedName: string
  courseName: string
  institutionName: string | null
  totalHours: number | null
  completedHours: number | null
  trainingStartedAt: string | null
  trainingEndedAt: string | null
  issuedAt: string | null
  expiresAt: string | null
  status: CertificateStatus
  revokedAt: string | null
  revokedReason: string | null
}

// ── 가격 규칙 (등급 × 발급유형 단가) ────────────────────────────────────────

export type IssueType = 'original' | 'reissue'

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  original: '최초발급',
  reissue: '재발급',
}

export interface PricingRule {
  id: string
  membershipGradeId: string
  issueType: IssueType
  priceKrw: number
  currency: string
  validFrom: string
  validTo: string | null
  isActive: boolean
  createdAt: string
}

export interface PricingRuleInput {
  membership_grade_id: string
  issue_type: IssueType
  price_krw: number
  currency?: string
  valid_from: string
  valid_to?: string | null
  is_active?: boolean
}

export interface PricingRuleUpdateInput {
  price_krw?: number
  valid_to?: string | null
  is_active?: boolean
}

/** completion_status 재사용 (이력 도메인과 값 목록 동일) */
export type { CompletionStatus }
