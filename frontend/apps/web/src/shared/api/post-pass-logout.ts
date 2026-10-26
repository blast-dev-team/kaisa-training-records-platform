/**
 * 회원 인증 해제 — 서버 세션(httponly 쿠키)을 끊는다.
 *
 * 화면 상태만 지우면 쿠키가 남아 새로고침 시 GET /api/me/session 으로 세션이
 * 되살아난다(공용 PC 에서 다음 사람이 이전 사람 이력을 보게 됨). 회원 세션만
 * 끊으므로 같은 브라우저의 관리자 로그인은 유지된다. 실패해도 화면은 해제한다.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function postPassLogout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/pass/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch (error: unknown) {
    console.error("pass logout failed", error);
  }
}
