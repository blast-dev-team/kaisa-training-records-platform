import type { CompletionStatus } from "@/src/entities/training-record";

export type CertificateStatus = "issued" | "revoked" | "superseded";

export const CERTIFICATE_STATUS_LABELS: Record<CertificateStatus, string> = {
  issued: "발급됨",
  revoked: "환불",
  superseded: "재발급",
};

/**
 * 재발급이 원 문서를 폐기할 때 BE 가 고정으로 남기는 사유
 * (issuance_service) — 결제 환불이 아니다. revoked 는 '환불'과
 * '재발급 대체' 두 경우를 포괄하므로 사유로 구분한다.
 */
export const REISSUE_REVOKED_REASON = "재발급으로 대체됨";

export function isReissueReplaced(
  c: Pick<Certificate, "status" | "revokedReason">,
): boolean {
  return c.status === "revoked" && c.revokedReason === REISSUE_REVOKED_REASON;
}

export interface Certificate {
  id: string;
  certificateNo: string;
  /** 묶음 확인서 번호 — 한 발급 이벤트가 공유하는 표시 번호(첫 확인서 번호) */
  bundleNo: string | null;
  certificateRequestId: string | null;
  traineeId: string;
  trainingRecordId: string;
  paymentOrderId: string | null;
  issuedName: string;
  courseName: string;
  institutionName: string | null;
  totalHours: number | null;
  completedHours: number | null;
  trainingStartedAt: string | null;
  trainingEndedAt: string | null;
  issuedAt: string | null;
  /** WEB에서 PDF 저장한 기록 — 최초 시각 · 횟수 */
  downloadedAt: string | null;
  downloadCount: number;
  expiresAt: string | null;
  status: CertificateStatus;
  /** 발급 경로 — 'member'(WEB 신청·결제) | 'admin'(어드민 발급 저장) */
  issueSource: "member" | "admin";
  revokedAt: string | null;
  revokedReason: string | null;
  /** 이 발급(묶음)에 담긴 교육내역 수 — 단건 1. 묶음이면 과정명이 'OOO 외 N건' */
  memberCount: number;
}

// ── 발급 유형 (요금 규칙 폐지 — 가격은 회원등급 소속. 유형은 차단·무료기한 규칙용) ──

export type IssueType = "original" | "reissue";

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  original: "최초발급",
  reissue: "재발급",
};

/** 발급 경로 — 어드민 발급은 회원 유효본과 무관한 독립 문서 */
export const ISSUE_SOURCE_LABELS: Record<Certificate["issueSource"], string> = {
  member: "회원",
  admin: "어드민",
};

/** completion_status 재사용 (이력 도메인과 값 목록 동일) */
export type { CompletionStatus };
