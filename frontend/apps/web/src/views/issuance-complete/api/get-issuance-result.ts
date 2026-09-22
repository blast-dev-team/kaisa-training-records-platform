/**
 * 발급 완료 결과 조회 API — 실제 백엔드 연동 (USE_MOCK 예외, 목록 API 참고).
 * GET /api/me/certificates 에서 유효 확인서를 찾아 반환한다.
 *
 * 묶음 확인서: 한 번의 발급 신청으로 발급된 N건은 같은 bundle_no(묶음 번호)를
 * 공유하고, 종이에 인쇄되는 확인서 번호는 이 묶음 번호 하나다.
 */

export interface IssuanceResult {
  /** 확인서 id — 다운로드 신고용 */
  certificateId: string;
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

/** 묶음 확인서 — 한 발급 이벤트로 발급된 N건을 확인서 1건으로 본다 */
export interface IssuanceBundle {
  /** 묶음 대표(첫) 확인서 id */
  certificateId: string;
  /** 묶음 확인서 번호 — 문서에 인쇄되고 진위확인 키가 되는 번호 */
  certificateNumber: string;
  /** 진위확인 ID — 묶음 번호와 같다 */
  verificationId: string;
  /** 발급일시 표시문 (예: 2026.09.16 14:22) */
  issuedAtLabel: string;
  /** 발급일시 (ISO) */
  issuedAt: string;
  /** 유효기간 표시문 (예: 2026.12.16까지) */
  validityLabel: string;
  /** 묶음에 포함된 교육이력 id — 발급 완료 화면의 이력 순서 계산용 */
  recordIds: string[];
}

/** 백엔드 MyCertificateResponse — snake_case 그대로 */
interface MyCertificateDto {
  id: string;
  training_record_id: string;
  certificate_no: string;
  bundle_no: string | null;
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

async function fetchMyCertificates(): Promise<MyCertificateDto[]> {
  const response = await fetch(`${API_BASE}/api/me/certificates`, {
    credentials: "include",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.message ?? "문제가 생겼어요. 잠시 후 다시 시도해 주세요",
    );
  }
  return response.json();
}

export async function getIssuanceResult(
  recordId: string,
): Promise<IssuanceResult> {
  const certificates = await fetchMyCertificates();
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
    certificateId: certificate.id,
    certificateNumber: certificate.bundle_no ?? certificate.certificate_no,
    verificationId: certificate.bundle_no ?? certificate.certificate_no,
    issuedAtLabel: formatDateTime(certificate.issued_at),
    issuedAt: certificate.issued_at,
    validityLabel: certificate.expires_at
      ? `${formatDate(certificate.expires_at)}까지`
      : "유효기간 제한 없음",
  };
}

/**
 * 발급 신청한 이력들의 묶음 확인서 목록 — 발급 완료 화면용.
 *
 * recordIds 에 포함된 이력이 속한 묶음만, recordIds 순서대로 반환한다.
 * 유효(issued) 확인서만 묶음을 이룬다 — 재발급된 건은 새 묶음으로 분리된다.
 */
export async function getIssuanceBundles(
  recordIds: string[],
): Promise<IssuanceBundle[]> {
  const certificates = await fetchMyCertificates();

  // 유효 확인서를 묶음 번호별로 그룹 — 구 데이터(null)는 자기 번호로 단건 묶음 취급
  const groups = new Map<string, MyCertificateDto[]>();
  for (const certificate of certificates) {
    if (certificate.status !== "issued") continue;
    const key = certificate.bundle_no ?? certificate.certificate_no;
    const group = groups.get(key);
    if (group) {
      group.push(certificate);
    } else {
      groups.set(key, [certificate]);
    }
  }

  // recordIds 순서 = 사용자가 선택한 순서 — 묶음도 그 순서로
  const bundles: IssuanceBundle[] = [];
  const seen = new Set<string>();
  for (const recordId of recordIds) {
    const certificate = certificates.find(
      (item) =>
        item.training_record_id === recordId && item.status === "issued",
    );
    if (certificate === undefined) continue;
    const key = certificate.bundle_no ?? certificate.certificate_no;
    if (seen.has(key)) continue;
    seen.add(key);
    const group = groups.get(key) ?? [certificate];
    // 묶음 대표 — 가장 처음 발급된 확인서. 묶음 번호는 대표의 certificate_no 다
    const head = group.reduce((first, cert) =>
      new Date(cert.issued_at).getTime() < new Date(first.issued_at).getTime()
        ? cert
        : first,
    );
    bundles.push({
      certificateId: head.id,
      certificateNumber: key,
      verificationId: key,
      issuedAtLabel: formatDateTime(head.issued_at),
      issuedAt: head.issued_at,
      validityLabel: head.expires_at
        ? `${formatDate(head.expires_at)}까지`
        : "유효기간 제한 없음",
      recordIds: group.map((cert) => cert.training_record_id),
    });
  }
  return bundles;
}
