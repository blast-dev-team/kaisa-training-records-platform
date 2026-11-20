/**
 * 확인서 합계 — 사내 합계 + min(외부 합계, 16).
 *
 * 외부계속교육은 최근 3년 최대 16시간까지만 인정된다. 한도 도입 전에 16시간을 넘게
 * 등록된 이력도 발급은 되며, 행은 그대로 두고 합계만 16시간으로 고정한다.
 * 서버(external_hours.document_total_hours)·ADMIN 과 같은 공식 — 진위확인 합계와 맞아야 한다.
 */
export const EXTERNAL_EDUCATION_MAX_HOURS = 16;

/** 기관 구분 → 외부교육 여부. 사내(internal)만 협회 교육이다(미선택·미연결도 외부). */
export const isExternalInstitutionType = (type: string | null | undefined) => type !== "internal";

export interface DocumentHoursRow {
  hours: number;
  isExternal: boolean;
}

export interface DocumentHoursSummary {
  /** 문서 합계 — PDF 마감 합계 */
  total: number;
  /** 외부교육 행 합계 (상한 적용 전) */
  externalHours: number;
  /** 외부교육 합계가 상한을 넘어 합계가 고정됐는지 */
  capped: boolean;
}

/** 소수 시간 합산의 부동소수 꼬리 정리 (0.1 + 0.2 → 0.3) */
const round2 = (value: number) => Math.round(value * 100) / 100;

export function documentHoursSummary(rows: DocumentHoursRow[]): DocumentHoursSummary {
  let internal = 0;
  let external = 0;
  for (const row of rows) {
    if (row.isExternal) external += row.hours;
    else internal += row.hours;
  }
  return {
    total: round2(internal + Math.min(external, EXTERNAL_EDUCATION_MAX_HOURS)),
    externalHours: round2(external),
    capped: external > EXTERNAL_EDUCATION_MAX_HOURS,
  };
}
