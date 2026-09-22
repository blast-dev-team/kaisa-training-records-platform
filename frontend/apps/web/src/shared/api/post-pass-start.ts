/**
 * PASS 본인인증 로그인 API — 실제 백엔드 호출.
 *
 * USE_MOCK=true 여도 로그인(고객 생성 포함)만큼은 실제 API로 동작한다 —
 * 목업 스위치의 예외 도메인. 세션은 httponly 쿠키(kaisa_session)로 관리되고,
 * 유효시간은 서버 세션 정책(USER_SESSION_TTL_MINUTES = 10분)을 따른다.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface PassStartResult {
  identityVerificationId: string;
  state: string;
}

/** 본인인증 시작 — FE가 만든 본인인증 건 ID를 서버에 등록하고 서명된 state 를 받는다 */
export async function postPassStart(
  identityVerificationId: string,
): Promise<PassStartResult> {
  const response = await fetch(`${API_BASE}/api/auth/pass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ identity_verification_id: identityVerificationId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.message ?? "본인인증을 시작하지 못했어요. 잠시 후 다시 시도해 주세요",
    );
  }
  return {
    identityVerificationId: data.identity_verification_id,
    state: data.state,
  };
}
