/**
 * 발급 완료 결과 조회 API.
 *
 * 백엔드가 아직 없어 VITE_API_URL 미설정 시 Figma 노드(37:26367)의 목업 데이터를
 * 반환한다. 백엔드 스펙 확정 후 경로·응답 매핑을 조정한다.
 */

export interface IssuanceResult {
  /** 확인서 번호 (예: KAISA-2026-0004821) */
  certificateNumber: string;
  /** 진위확인 ID (예: A7K9-2F4M-QX58) */
  verificationId: string;
  /** 발급일시 표시문 (예: 2026.09.06 14:22) */
  issuedAtLabel: string;
  /** 유효기간 표시문 (예: 발급일로부터 3개월) */
  validityLabel: string;
  /** 확인서 미리보기 이미지 URL — 없으면 기본 에셋으로 대체 */
  previewImageUrl?: string;
  /** 확인서 PDF 다운로드 URL — 있으면 blob 다운로드, 없으면 인쇄로 대체 */
  pdfUrl?: string;
}

/** 목업 데이터 — Figma 노드 37:26367 값 */
const DEMO_RESULT: IssuanceResult = {
  certificateNumber: 'KAISA-2026-0004821',
  verificationId: 'A7K9-2F4M-QX58',
  issuedAtLabel: '2026.09.06 14:22',
  validityLabel: '발급일로부터 3개월',
};

const API_BASE = import.meta.env.VITE_API_URL;

export async function getIssuanceResult(
  recordId: string,
): Promise<IssuanceResult> {
  // 백엔드 미연동 — 목업: 짧은 지연 후 노드 데이터 반환 (신청 ID와 무관)
  if (!API_BASE) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return DEMO_RESULT;
  }

  const response = await fetch(
    `${API_BASE}/api/v1/issuances/${encodeURIComponent(recordId)}`,
  );
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('발급 내역을 찾을 수 없어요');
    }
    throw new Error('문제가 생겼어요. 잠시 후 다시 시도해 주세요');
  }

  // TODO(백엔드 스펙 확정 후): 응답 필드 매핑 조정
  return (await response.json()) as IssuanceResult;
}
