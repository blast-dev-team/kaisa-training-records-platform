/** 이메일 형식 검사 — 서버(EmailStr)가 거절하기 전에 화면에서 먼저 막는다 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailError(value: string | null | undefined): string | null {
  const text = (value ?? '').trim()
  if (!text) return null
  return EMAIL_RE.test(text) ? null : '이메일 형식을 확인해 주세요'
}
