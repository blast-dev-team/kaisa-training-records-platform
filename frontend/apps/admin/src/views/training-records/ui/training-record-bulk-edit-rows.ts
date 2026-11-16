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
  };
}

/** 변경된 필드만 모은다 — 없은 필드는 생략(변경 없음), 빈값은 null(지우기) */
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
      if (row[key] !== (orig[key] ?? "")) {
        patch[key] = row[key] === "" ? null : row[key];
        changed = true;
      }
    };
    const hours = (key: "totalHours") => {
      const value = row[key].trim();
      const before = orig[key] === null ? "" : String(orig[key]);
      if (value !== before) {
        if (value === "") {
          patch[key] = null;
        } else {
          const num = Number(value);
          if (Number.isNaN(num)) return; // 잘못된 숫자 — 이 필드만 건너뜀
          patch[key] = num;
        }
        changed = true;
      }
    };

    if (row.completionStatus !== orig.completionStatus) {
      patch.completionStatus = row.completionStatus;
      changed = true;
    }
    date("startedAt");
    date("endedAt");
    hours("totalHours");
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
