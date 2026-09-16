/**
 * 본인인증 세션 조회 — 새로고침 시 인증 상태 복구용.
 *
 * httponly 쿠키가 진실 원본이므로 브라우저 저장소에 인증 상태를 두지 않고
 * 매 부팅 시 서버에 물어본다. 401/403 = 미인증(null).
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface SessionStatus {
  /** 인증된 사용자 표시명 */
  name: string;
  /** 세션 만료 시각 (ISO 8601 — KST 오프셋 포함) */
  expires_at: string;
}

export async function getSession(): Promise<SessionStatus | null> {
  const response = await fetch(`${API_BASE}/api/me/session`, {
    credentials: "include",
  });
  if (!response.ok) return null;
  return response.json();
}
