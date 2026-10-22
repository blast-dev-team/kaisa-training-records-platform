/**
 * KAISA 계정 우회 로그인 API — 성명 KAISA + 지정 생년월일·휴대전화면 PASS 인증을 건너뛴다.
 * 서버도 세 값을 모두 검사한다 (불일치 시 404).
 *
 * 슈퍼 계정(전 회원 조회·미리보기)과 달리 일반 회원 스코프다. 연결된 교육이력
 * 1건으로 실제 발급·결제 플로우를 확인하는 용도. 전 환경(staging·production) 허용.
 */

import type { PassCompleteResult } from "./post-pass-complete";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function postPassKaisaLogin(
  name: string,
  birth: string,
  phone: string,
): Promise<PassCompleteResult> {
  const response = await fetch(`${API_BASE}/api/auth/pass/kaisa-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, birth, phone }),
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
