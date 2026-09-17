/**
 * 본인인증 세션 연장 — 유효 세션이면 서버 만료 시각을 리셋하고 새 상태 반환.
 *
 * 401 = 이미 만료된 세션(null 반환 — FE 타이머가 곧 자동 signOut 한다).
 */

import type { SessionStatus } from "@/src/shared/api/get-session";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function postSessionExtend(): Promise<SessionStatus | null> {
  const response = await fetch(`${API_BASE}/api/me/session/extend`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) return null;
  return response.json();
}
