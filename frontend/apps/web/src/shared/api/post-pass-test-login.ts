/**
 * 테스트 본인인증 우회 로그인 API — 성명 '테스트' 입력 시 PASS 인증을 건너뛴다.
 *
 * 서버가 고정 CI 로 고객을 찾거나 생성하고 세션 쿠키를 내려준다.
 * local·staging 전용 — production 은 404 로 응답한다.
 */

import type { PassCompleteResult } from "./post-pass-complete";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function postPassTestLogin(
  name: string,
): Promise<PassCompleteResult> {
  const response = await fetch(`${API_BASE}/api/auth/pass/test-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.message ?? "로그인에 실패했어요. 잠시 후 다시 시도해 주세요",
    );
  }
  return {
    id: data.id,
    name: data.name ?? null,
    matched: Boolean(data.matched),
    reviewStatus: data.review_status ?? null,
    isSuper: Boolean(data.is_super),
  };
}
