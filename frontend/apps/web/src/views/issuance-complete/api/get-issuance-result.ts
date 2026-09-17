/**
 * 발급 완료 결과 조회 API — 실제 백엔드 연동 (USE_MOCK 예외, 목록 API 참고).
 * GET /api/me/certificates 에서 해당 교육이력의 최신 유효 확인서를 찾아 반환한다.
 * 재발급된 이력은 직전 확인서가 superseded 이므로 자연스럽게 최신 건이 선택된다.
 */

export interface IssuanceResult {
  /** 확인서 번호 (예: CERT-20260916-1) */
  certificateNumber: string;
  /** 진위확인 ID — 확인서 번호를 그대로 쓴다 (진위확인 API 가 certificate_no 로 검증) */
  verificationId: string;
  /** 발급일시 표시문 (예: 2026.09.16 14:22) */
  issuedAtLabel: string;
  /** 발급일시 (ISO) — 확인서 문서의 발급일 표기용 */
  issuedAt: string;
  /** 유효기간 표시문 (예: 2026.12.16까지) */
  validityLabel: string;
  /** 확인서 미리보기 이미지 URL — 없으면 기본 에셋으로 대체 */
  previewImageUrl?: string;
  /** 확인서 PDF 다운로드 URL — 있으면 blob 다운로드, 없으면 인쇄로 대체 */
  pdfUrl?: string;
}

/** 백엔드 MyCertificateResponse — snake_case 그대로 */
interface MyCertificateDto {
  training_record_id: string;
  certificate_no: string;
  issue_type: string;
  issued_at: string;
  expires_at: string | null;
  status: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

export async function getIssuanceResult(
  recordId: string,
): Promise<IssuanceResult> {
  const response = await fetch(`${API_BASE}/api/me/certificates`, {
    credentials: "include",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.message ?? "문제가 생겼어요. 잠시 후 다시 시도해 주세요",
    );
  }
  const certificates: MyCertificateDto[] = await response.json();
  const certificate = certificates
    .filter(
      (item) => item.training_record_id === recordId && item.status === "issued",
    )
    .sort(
      (a, b) =>
        new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime(),
    )[0];
  if (certificate === undefined) {
    throw new Error("발급된 확인서가 없어요");
  }
  return {
    certificateNumber: certificate.certificate_no,
    verificationId: certificate.certificate_no,
    issuedAtLabel: formatDateTime(certificate.issued_at),
    issuedAt: certificate.issued_at,
    validityLabel: certificate.expires_at
      ? `${formatDate(certificate.expires_at)}까지`
      : "유효기간 제한 없음",
  };
}
