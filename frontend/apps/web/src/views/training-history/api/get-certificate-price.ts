/**
 * 확인서 발급 가격 미리보기 API — 실제 백엔드 연동.
 *
 * 가격은 회원등급 단가로 서버가 정한다 (일반 3,000원·평생·연간 1,800원
 * 기본, 어드민에서 수정). 결제 모달 표기 금액은 이 값을 쓴다 —
 * 무료 재발급 규칙은 폐지됐고 매 발급마다 결제한다.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface CertificatePrice {
  training_record_id: string;
  course_name: string;
  grade_name: string | null;
  price_krw: number;
  currency: string;
}

export async function getCertificatePrice(
  trainingRecordId: string,
): Promise<CertificatePrice> {
  const params = new URLSearchParams({
    training_record_id: trainingRecordId,
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
