import { EXTERNAL_EDUCATION_MAX_HOURS, formatHours } from "@/src/entities/training-record";

interface Group {
  key: string;
  traineeName: string;
  totalHours: number;
  externalHours: number;
  externalCapped: boolean;
}

/**
 * 확인서 합계 고정 안내 — 외부교육은 최대 16시간까지만 인정된다.
 * 항상 기준을 보여 주고, 실제로 고정되는 문서가 있으면 감리원별로 강조한다.
 */
export function DocumentHoursNotice({ groups }: { groups: Group[] }) {
  const capped = groups.filter((group) => group.externalCapped);
  return (
    <div
      className={
        capped.length > 0
          ? "mb-3 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-12 text-warn-ink"
          : "mb-3 text-12 text-ink-3"
      }
    >
      <p>
        외부교육 시간은 최대 {EXTERNAL_EDUCATION_MAX_HOURS}시간까지만 인정됩니다.{" "}
        {EXTERNAL_EDUCATION_MAX_HOURS}시간을 초과하면 외부교육 합계는 {EXTERNAL_EDUCATION_MAX_HOURS}시간으로
        고정됩니다.
      </p>
      {capped.map((group) => (
        <p key={group.key} className="mt-1 font-medium">
          {groups.length > 1 && `${group.traineeName || "감리원"} — `}외부교육 {formatHours(group.externalHours)}시간 중{" "}
          {EXTERNAL_EDUCATION_MAX_HOURS}시간만 인정돼 합계가 {formatHours(group.totalHours)}시간으로 표기돼요
        </p>
      ))}
    </div>
  );
}
