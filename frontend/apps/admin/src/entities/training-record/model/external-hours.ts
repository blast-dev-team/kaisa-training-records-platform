/**
 * 외부계속교육 등록 한도 — 감리원별 최근 3년 외부교육 합계는 16시간을 넘을 수 없다.
 * 서버(training_record/service/external_hours.py)가 최종 판정하고, 화면은 저장 전에 같은 기준으로 미리 안내한다.
 */
export interface ExternalHoursSummary {
  /** 집계 창 시작일 'YYYY-MM-DD' — 수강 시작일이 이 날 이후인 이력만 센다 */
  windowStart: string
  /** 창 안 외부교육 합계 (수정 중인 이력은 제외된 값) */
  externalHours: number
  maxHours: number
  remainingHours: number
}

/** 기관 구분 → 외부교육 여부. 사내(internal)만 협회 교육이다(미선택·미연결도 외부). */
export const isExternalInstitutionType = (type: string | null | undefined) => type !== 'internal'

export interface ExternalCapInput {
  summary: ExternalHoursSummary
  isExternal: boolean
  /** 'YYYY-MM-DD' 또는 빈 문자열 */
  startedAt: string
  hours: number
  /** 수정 중인 이력의 원래 시간이 합계에 들어가 있었다면 그 시간 (신규 등록은 0) */
  originalCountedHours?: number
  /** 취소(canceled) 이력은 합계에 넣지 않는다 */
  canceled?: boolean
}

export interface ExternalCapResult {
  /** 이 등록이 한도 집계 대상인지 (외부 기관 + 수강 시작일이 3년 창 안) */
  counted: boolean
  blocked: boolean
  /** 이번 등록 전 합계 — 안내 문구의 '이미 n시간' */
  before: number
  /** 이번 등록 전 남은 한도 */
  remaining: number
}

/** 서버와 같은 기준 — 변경으로 합계가 늘었고 늘어난 합계가 상한을 넘으면 차단 */
export function evaluateExternalCap({
  summary,
  isExternal,
  startedAt,
  hours,
  originalCountedHours = 0,
  canceled = false,
}: ExternalCapInput): ExternalCapResult {
  const counted = isExternal && !canceled && startedAt !== '' && startedAt >= summary.windowStart
  const before = summary.externalHours + originalCountedHours
  const after = summary.externalHours + (counted && Number.isFinite(hours) ? hours : 0)
  return {
    counted,
    blocked: counted && after > before && after > summary.maxHours,
    before,
    remaining: Math.max(0, summary.maxHours - before),
  }
}

/** 8 → '8', 7.5 → '7.5' */
export const formatHours = (hours: number) => String(Number(hours.toFixed(2)))

export const externalCapExceededMessage = (before: number, maxHours: number) =>
  `이미 최근 3년 내 등록된 외부교육이 ${formatHours(before)}시간이라 등록할 수 없어요 ` +
  `(최대 ${formatHours(maxHours)}시간, 남은 한도 ${formatHours(Math.max(0, maxHours - before))}시간)`

/**
 * 확인서 합계 — 사내 합계 + min(외부 합계, 16).
 * 한도 도입 전에 16시간을 넘게 등록된 이력도 발급은 되며, 행은 그대로 두고 합계만 고정한다.
 * 서버(external_hours.document_total_hours)·WEB 과 같은 공식 — 진위확인 합계와 맞아야 한다.
 */
export const EXTERNAL_EDUCATION_MAX_HOURS = 16

export interface DocumentHoursRow {
  hours: number
  isExternal: boolean
}

export interface DocumentHoursSummary {
  /** 문서 합계 — PDF 마감 합계 */
  total: number
  /** 외부교육 행 합계 (상한 적용 전) */
  externalHours: number
  /** 외부교육 합계가 상한을 넘어 합계가 고정됐는지 */
  capped: boolean
}

/** 소수 시간 합산의 부동소수 꼬리 정리 (0.1 + 0.2 → 0.3) */
const round2 = (value: number) => Math.round(value * 100) / 100

export function documentHoursSummary(rows: DocumentHoursRow[]): DocumentHoursSummary {
  let internal = 0
  let external = 0
  for (const row of rows) {
    if (row.isExternal) external += row.hours
    else internal += row.hours
  }
  return {
    total: round2(internal + Math.min(external, EXTERNAL_EDUCATION_MAX_HOURS)),
    externalHours: round2(external),
    capped: external > EXTERNAL_EDUCATION_MAX_HOURS,
  }
}
