/**
 * 확인서 발급 가격 미리보기 API — 실제 백엔드 연동.
 *
 * 가격은 회원등급 × 발급 유형 규칙으로 서버가 정한다 (일반 3,000원·평생·연간 1,800원
 * 기본, 어드민에서 수정). 결제 모달 표기 금액은 이 값을 쓴다 — 7일 이내 무료 재발급은
 * 모달 쪽에서 0원으로 계산한다 (서버 재발급 무료 판정은 신청 시점).
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface CertificatePrice {
  training_record_id: string;
  course_name: string;
  issue_type: string;
  grade_name: string | null;
  price_krw: number;
  currency: string;
}

export async function getCertificatePrice(
  trainingRecordId: string,
  issueType: "original" | "reissue",
): Promise<CertificatePrice> {
  const params = new URLSearchParams({
    training_record_id: trainingRecordId,
    issue_type: issueType,
  });
  const response = await fetch(`${API_BASE}/api/me/certificate-price?${params}`, {
    credentials: "include",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      body.message ?? "가격 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요",
    );
  }
  return body;
}
