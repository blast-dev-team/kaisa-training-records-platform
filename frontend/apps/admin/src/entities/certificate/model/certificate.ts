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

// ── 발급 유형 (요금 규칙 폐지 — 가격은 회원등급 소속. 유형은 차단·무료기한 규칙용) ──

export type IssueType = 'original' | 'reissue'

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  original: '최초발급',
  reissue: '재발급',
}

/** completion_status 재사용 (이력 도메인과 값 목록 동일) */
export type { CompletionStatus }
