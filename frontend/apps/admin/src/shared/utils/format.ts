/** gongcar crm-fe format.ts에서 이식 — 어드민이 쓰는 함수만. */

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-'
  const num = typeof value === 'string' ? value.replace(/[^0-9.-]/g, '') : String(value)
  if (!num || isNaN(Number(num))) return String(value)
  return Number(num).toLocaleString('ko-KR')
}

export function formatWon(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-'
  const num = typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) : value
  if (isNaN(num)) return String(value)
  return num.toLocaleString('ko-KR') + '원'
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) return '-'
  const digits = value.replace(/[^0-9]/g, '')
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return value
}

/**
 * 타임스탬프를 'YYYY-MM-DD HH:mm' (분 단위)로 표시. timestamptz 필드용.
 * @example formatDateTime('2026-05-19T14:30:00Z') // '2026-05-19 23:30' (KST)
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 서버가 준 ISO 문자열(오프셋 포함) → 로컬(=KST) 날짜 'YYYY-MM-DD'.
 *
 * **`iso.slice(0, 10)` 금지** — 서버는 timestamptz를 UTC 오프셋으로 직렬화하므로
 * 앞 10자리는 UTC 날짜다. KST 자정에 저장된 값이 하루 앞으로 보인다.
 * 시각이 없는 값(date 컬럼, 'YYYY-MM')은 그대로 통과시킨다.
 */
export function toYMD(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.includes('T')) return value.slice(0, 10)
  const d = new Date(value)
  if (isNaN(d.getTime())) return value.slice(0, 10)
  return d.toLocaleDateString('sv-SE')
}

/** 오늘 날짜 'YYYY-MM-DD' — 브라우저 로컬(=KST) 기준. toISOString()은 UTC라 KST 새벽에 어제가 된다. */
export function todayYMD(): string {
  return new Date().toLocaleString('sv-SE').slice(0, 10)
}
