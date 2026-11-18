/** 시수 입력 검증 — BE 스키마(Hours: 0 이상, Numeric(8,2) 상한)와 같은 규칙.
 *  빈 값·음수·숫자가 아닌 값·상한 초과는 저장할 수 없다.
 *  문구는 BE 검증 응답과 같은 문장을 쓴다 — 서버에 보내기 전에 같은 안내를 먼저 보여준다. */
export const HOURS_MAX = 999999.99

const HOURS_MAX_TEXT = HOURS_MAX.toLocaleString('ko-KR', { maximumFractionDigits: 2 })

/** 받침 유무에 맞는 조사 (은/는, 을/를) */
function josa(word: string, withFinal: string, withoutFinal: string): string {
  const code = word.charCodeAt(word.length - 1)
  if (code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0) return withFinal
  return withoutFinal
}

export function isValidHours(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false
  const text = String(value).trim()
  if (text === '') return false
  const n = Number(text)
  return Number.isFinite(n) && n >= 0 && n <= HOURS_MAX
}

/**
 * 시수 입력 검증 문구 — 정상이면 null.
 * - required=false(기본): 빈 값은 통과(수정 안 함)
 * - required=true: 빈 값이면 "총 시수를 입력해 주세요"
 */
export function hoursError(
  value: string | number | null | undefined,
  options: { label?: string; required?: boolean } = {},
): string | null {
  const label = options.label ?? '시수'
  const text = value === null || value === undefined ? '' : String(value).trim()
  if (text === '') return options.required ? `${label}${josa(label, '을', '를')} 입력해 주세요` : null
  const n = Number(text)
  const eun = `${label}${josa(label, '은', '는')}`
  if (!Number.isFinite(n)) return `${eun} 숫자로 입력해 주세요`
  if (n < 0) return `${eun} 0 이상이어야 해요`
  if (n > HOURS_MAX) return `${eun} ${HOURS_MAX_TEXT} 이하로 입력해 주세요`
  return null
}
