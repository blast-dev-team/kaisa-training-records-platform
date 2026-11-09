import {
  EXTERNAL_EDUCATION_MAX_HOURS,
  type DocumentHoursSummary,
} from "@/src/shared/utils/document-total-hours";

/** 8 → "8", 7.5 → "7.5" */
const formatHours = (value: number) => String(Number(value.toFixed(2)));

/**
 * 확인서 합계 고정 안내 — 외부교육은 최대 16시간까지만 인정된다.
 * 항상 기준을 보여 주고, 이번 문서가 실제로 고정되면 시간을 짚어 강조한다.
 */
export function DocumentHoursNotice({ summary }: { summary: DocumentHoursSummary }) {
  return (
    <div
      className={
        summary.capped
          ? "shrink-0 rounded-md bg-primary-50 px-4 py-3 text-13 leading-normal text-primary-700"
          : "shrink-0 text-13 leading-normal text-gray-500"
      }
    >
      <p>
        외부교육 시간은 최대 {EXTERNAL_EDUCATION_MAX_HOURS}시간까지만 인정됩니다.{" "}
        {EXTERNAL_EDUCATION_MAX_HOURS}시간을 초과하면 외부교육 합계는 {EXTERNAL_EDUCATION_MAX_HOURS}시간으로
        고정됩니다.
      </p>
      {summary.capped && (
        <p className="mt-1 font-bold">
          선택한 외부교육 {formatHours(summary.externalHours)}시간 중 {EXTERNAL_EDUCATION_MAX_HOURS}시간만
          인정돼 확인서 합계는 {formatHours(summary.total)}시간으로 표기돼요
        </p>
      )}
    </div>
  );
}
