/**
 * PASS 본인인증 완료 API — 실제 백엔드 호출 (USE_MOCK 예외, post-pass-start 참고).
 *
 * 서버가 포트원에서 인증 결과를 직접 조회해 CI 로 고객을 찾거나 생성하고
 * 세션 쿠키를 내려준다. 이 호출이 성공하면 로그인(고객 생성)이 확정된다.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface PassCompleteResult {
  /** 고객(User) ID */
  id: string;
  /** 고객명 — 인증 결과에 없으면 null */
  name: string | null;
  /** 기존 고객이면 true, 신규 생성이면 false */
  matched: boolean;
  /** 교육생 심사 상태 — 교육생 미연결이면 manual_review */
  reviewStatus: string | null;
}

/** 본인인증 완료 — state 로 서버가 결과를 검증하고 세션을 발급한다 */
export async function postPassComplete(
  state: string,
): Promise<PassCompleteResult> {
  const response = await fetch(`${API_BASE}/api/auth/pass/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ state }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.message ?? "로그인에 실패했어요. 본인인증부터 다시 진행해 주세요",
    );
  }
  return {
    id: data.id,
    name: data.name ?? null,
    matched: Boolean(data.matched),
    reviewStatus: data.review_status ?? null,
  };
}
