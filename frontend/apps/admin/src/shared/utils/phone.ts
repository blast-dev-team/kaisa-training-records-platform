/** 전화번호 입력 검증 — BE(core/validation.PhoneStr)와 같은 규칙.
 *  숫자와 구분 기호(공백·하이픈·괄호·점·+)만 허용하고, 숫자는 9~11자리.
 *  한글·영문이 섞인 값("010-1234-5678(집)", "없음")이 그대로 저장되던 문제를 막는다. */
const PHONE_ALLOWED = /^[0-9\s\-+().]*$/

export function phoneError(value: string | null | undefined): string | null {
  const text = (value ?? '').normalize('NFKC').trim()
  if (!text) return null
  if (!PHONE_ALLOWED.test(text)) return '전화번호는 숫자와 하이픈(-)만 입력해 주세요'
  let digits = text.replace(/\D/g, '')
  // +82 국제표기는 0 으로 되돌려 센다 (+82 10-… → 010-…)
  if (text.startsWith('+82')) digits = `0${digits.slice(2)}`
  if (digits.length < 9 || digits.length > 11) return '전화번호는 숫자 9~11자리로 입력해 주세요'
  return null
}
