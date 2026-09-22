import type { CompletionStatus } from '@/src/entities/training-record'

export type CertificateStatus = 'issued' | 'revoked' | 'superseded'

export const CERTIFICATE_STATUS_LABELS: Record<CertificateStatus, string> = {
  issued: '발급됨',
  revoked: '환불',
  superseded: '대체',
}

export interface Certificate {
  id: string
  certificateNo: string
  /** 묶음 확인서 번호 — 한 발급 이벤트가 공유하는 표시 번호(첫 확인서 번호) */
  bundleNo: string | null
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
  /** WEB에서 PDF 저장한 기록 — 최초 시각 · 횟수 */
  downloadedAt: string | null
  downloadCount: number
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
