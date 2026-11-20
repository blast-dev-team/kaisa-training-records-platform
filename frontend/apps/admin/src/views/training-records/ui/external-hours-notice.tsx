import { useQuery } from "@tanstack/react-query";
import {
  evaluateExternalCap,
  externalCapExceededMessage,
  formatHours,
  isExternalInstitutionType,
  trainingRecordQueries,
  type ExternalCapResult,
  type ExternalHoursSummary,
  type TrainingRecord,
} from "@/src/entities/training-record";

interface ExternalCapParams {
  traineeId: string | null;
  /** 선택한 기관의 구분 — undefined 는 기관 미선택(판정 안 함) */
  institutionType: string | null | undefined;
  startedAt: string;
  totalHours: string;
  completionStatus: string;
  /** 수정 중인 이력 — 서버 합계에서 빼고, 원래 시간이 집계됐었는지 계산한다 */
  record: TrainingRecord | null;
}

/** 등록 모달용 외부교육 한도 판정 — 서버 합계 + 입력값으로 저장 전에 미리 막는다 */
export function useExternalCap({
  traineeId,
  institutionType,
  startedAt,
  totalHours,
  completionStatus,
  record,
}: ExternalCapParams): { summary?: ExternalHoursSummary; result: ExternalCapResult | null } {
  const { data: summary } = useQuery(
    trainingRecordQueries.externalHours(traineeId, record?.id ?? null),
  );
  if (!summary || institutionType === undefined) return { summary, result: null };

  const originalCounted =
    record &&
    isExternalInstitutionType(record.institutionType) &&
    record.completionStatus !== "canceled" &&
    !!record.startedAt &&
    record.startedAt >= summary.windowStart
      ? (record.totalHours ?? 0)
      : 0;

  return {
    summary,
    result: evaluateExternalCap({
      summary,
      isExternal: isExternalInstitutionType(institutionType),
      startedAt,
      hours: totalHours === "" ? 0 : Number(totalHours),
      originalCountedHours: originalCounted,
      canceled: completionStatus === "canceled",
    }),
  };
}

/** 외부 기관을 고르면 시간 입력란 아래에 최근 3년 외부교육 합계·남은 한도를 보여 준다 */
export function ExternalHoursNotice({
  summary,
  result,
  isExternal,
}: {
  summary?: ExternalHoursSummary;
  result: ExternalCapResult | null;
  isExternal: boolean;
}) {
  if (!summary || !result || !isExternal) return null;
  if (result.blocked) {
    return (
      <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-12 font-medium text-danger">
        {externalCapExceededMessage(result.before, summary.maxHours)}
      </p>
    );
  }
  return (
    <p className="text-11 text-ink-3">
      최근 3년 외부교육 {formatHours(result.before)}시간 등록됨 ·{" "}
      {result.remaining > 0
        ? `${formatHours(result.remaining)}시간 더 등록할 수 있어요`
        : "외부교육은 더 등록할 수 없어요"}{" "}
      (외부교육은 3년간 최대 {formatHours(summary.maxHours)}시간)
      {!result.counted && " — 3년이 지났거나 시작일이 없는 교육은 한도에 포함되지 않아요"}
    </p>
  );
}
