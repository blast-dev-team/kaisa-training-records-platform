import { isValidHours } from "@/src/shared/utils/hours";
import type {
  TrainingRecord,
  TrainingRecordBulkUpdateItem,
} from "@/src/entities/training-record";

/** 모달 내 한 행의 입력 상태 — input 은 문자열로 든다 */
export interface EditRow {
  id: string;
  traineeName: string | null;
  institutionId: string | null;
  institutionName: string;
  courseName: string;
  courseId: string | null;
  completionStatus: string;
  startedAt: string;
  endedAt: string;
  totalHours: string;
  memo: string;
}

export function toRow(record: TrainingRecord): EditRow {
  return {
    id: record.id,
    traineeName: record.traineeName,
    institutionId: record.institutionId,
    institutionName: record.institutionName ?? "",
    courseName: record.courseName,
    courseId: record.courseId,
    completionStatus: record.completionStatus,
    startedAt: record.startedAt ?? "",
    endedAt: record.endedAt ?? "",
    totalHours: record.totalHours === null ? "" : String(record.totalHours),
    memo: record.memo ?? "",
  };
}

/** 변경된 필드만 모은다 — 없은 필드는 생략(변경 없음), 빈값은 null(지우기) */
/** 시수 칸에 잘못된 값(음수·숫자 아님·상한 초과)이 들어간 행 — 저장 전에 막는다 */
export function invalidHoursRows(rows: EditRow[]): EditRow[] {
  return rows.filter((r) => r.totalHours.trim() !== "" && !isValidHours(r.totalHours))
}

export function buildUpdates(
  rows: EditRow[],
  originals: Map<string, TrainingRecord>,
): TrainingRecordBulkUpdateItem[] {
  const updates: TrainingRecordBulkUpdateItem[] = [];
  for (const row of rows) {
    const orig = originals.get(row.id);
    if (!orig) continue;
    const patch: TrainingRecordBulkUpdateItem = { id: row.id };
    let changed = false;

    const date = (key: "startedAt" | "endedAt") => {
      // 수강 기간은 비울 수 없는 칸 — 빈 칸은 '변경 없음'으로 본다 (서버도 null 을 거절)
      if (row[key] === "" || row[key] === (orig[key] ?? "")) return;
      patch[key] = row[key];
      changed = true;
    };
    const hours = (key: "totalHours") => {
      const value = row[key].trim();
      const before = orig[key] === null ? "" : String(orig[key]);
      // 시수는 비울 수 없는 칸 — 빈 칸은 '변경 없음'으로 본다(예전엔 null 을 보내 서버 500)
      if (value === "" || value === before) return;
      if (!isValidHours(value)) return; // 잘못된 값 — 저장 전 invalidHoursRows 로 막는다
      patch[key] = Number(value);
      changed = true;
    };

    if (row.completionStatus !== orig.completionStatus) {
      patch.completionStatus = row.completionStatus;
      changed = true;
    }
    date("startedAt");
    date("endedAt");
    hours("totalHours");
    // 메모 — 비우면 지운다(null)
    if (row.memo.trim() !== (orig.memo ?? "")) {
      patch.memo = row.memo.trim() || null;
      changed = true;
    }
    // 과정 변경 — 마스터에서만 선택(해제는 스냅샷 정합성 문제로 미지원)
    if (row.courseId !== orig.courseId && row.courseId !== null) {
      patch.courseId = row.courseId;
      changed = true;
    }

    if (changed) updates.push(patch);
  }
  return updates;
}

/** 기관을 바꿨는데 그 기관의 과정을 아직 고르지 않은 행 — 저장하면 기관만 어긋나므로 막는다 */
export function rowsMissingCourse(rows: EditRow[], originals: Map<string, TrainingRecord>): EditRow[] {
  return rows.filter((row) => {
    const orig = originals.get(row.id);
    return !!orig && row.institutionId !== orig.institutionId && row.courseId === null;
  });
}
