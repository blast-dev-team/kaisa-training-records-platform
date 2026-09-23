import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Button } from "@/src/shared/ui/button";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { Select } from "@/src/shared/ui/select";
import { SearchableSelect, fetchOptions } from "@/src/shared/ui/searchable-select";
import {
  patchTrainingRecordBulk,
  trainingRecordQueries,
  COMPLETION_STATUS_LABELS,
  type TrainingRecord,
  type TrainingRecordBulkUpdateItem,
} from "@/src/entities/training-record";

/** 과정 선택 옵션 — 등록 폼과 같은 매핑 (보조 표기: 기관명) */
const courseOptionsFetcher = fetchOptions("/courses", {}, (c) => ({
  value: c.id as string,
  label: c.name as string,
  hint: c.institution_name as string | undefined,
}));

/** 모달 내 한 행의 입력 상태 — input 은 문자열로 든다 */
interface EditRow {
  id: string;
  traineeName: string | null;
  courseName: string;
  courseId: string | null;
  completionStatus: string;
  startedAt: string;
  endedAt: string;
  totalHours: string;
  completedHours: string;
}

function toRow(record: TrainingRecord): EditRow {
  return {
    id: record.id,
    traineeName: record.traineeName,
    courseName: record.courseName,
    courseId: record.courseId,
    completionStatus: record.completionStatus,
    startedAt: record.startedAt ?? "",
    endedAt: record.endedAt ?? "",
    totalHours: record.totalHours === null ? "" : String(record.totalHours),
    completedHours: record.completedHours === null ? "" : String(record.completedHours),
  };
}

/** 변경된 필드만 모은다 — 없은 필드는 생략(변경 없음), 빈값은 null(지우기) */
function buildUpdates(
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
    const hours = (key: "totalHours" | "completedHours") => {
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
    hours("completedHours");
    // 과정 변경 — 마스터에서만 선택(해제는 스냅샷 정합성 문제로 미지원)
    if (row.courseId !== orig.courseId && row.courseId !== null) {
      patch.courseId = row.courseId;
      changed = true;
    }

    if (changed) updates.push(patch);
  }
  return updates;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  records: TrainingRecord[];
  /** 저장 성공 후 — 부모에서 선택 해제 */
  onSaved: () => void;
}

const TH =
  "sticky top-0 z-10 bg-panel-2 px-2 py-2 text-left text-[11px] font-medium text-ink-3 whitespace-nowrap";
const TD = "px-2 py-1.5 align-middle";

export function TrainingRecordBulkEditDialog({ isOpen, onClose, records, onSaved }: Props) {
  const [rows, setRows] = useState<EditRow[]>([]);
  const originals = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);

  useEffect(() => {
    if (isOpen) setRows(records.map(toRow));
  }, [isOpen, records]);

  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (updates: TrainingRecordBulkUpdateItem[]) => patchTrainingRecordBulk(updates),
    onSuccess: (res) => {
      toast.success(`${res.updated}건을 수정했어요`);
      queryClient.invalidateQueries({ queryKey: trainingRecordQueries.all() });
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setField = (id: string, patch: Partial<EditRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleSave = () => {
    const updates = buildUpdates(rows, originals);
    if (updates.length === 0) {
      toast.info("변경된 내용이 없어요");
      return;
    }
    mutation.mutate(updates);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`이력 일괄 수정 (${records.length}건)`}
      description="빈 칸으로 저장하면 그 값이 지워져요. 변경한 행만 반영됩니다."
      size="2xl"
      actions={[
        { label: "취소", onClick: onClose },
        { label: "저장", isLoading: mutation.isPending, onClick: handleSave },
      ]}
    >
      <div className="max-h-[60vh] overflow-auto rounded-lg border border-line">
        <table className="w-full min-w-[1060px] text-[13px]" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 110 }} />
            <col style={{ width: 200 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 86 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={TH}>감리원</th>
              <th className={TH}>과정</th>
              <th className={TH}>시작일</th>
              <th className={TH}>종료일</th>
              <th className={`${TH} text-right`}>총시수</th>
              <th className={`${TH} text-right`}>이수시수</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line-2">
                <td className={`${TD} truncate`} title={row.traineeName ?? undefined}>
                  {row.traineeName ?? "—"}
                </td>
                <td className={TD}>
                  <SearchableSelect
                    className="w-full"
                    value={row.courseId}
                    onChange={(v) => setField(row.id, { courseId: v })}
                    fetchPage={courseOptionsFetcher}
                    placeholder={row.courseName || "과정 선택"}
                    disableCreate
                    queryKeyPrefix={["options", "courses"]}
                    selectedLabel={row.courseName}
                  />
                </td>
                <td className={TD}>
                  <Select
                    className="h-8 w-full py-0 text-[13px]"
                    value={row.completionStatus}
                    onChange={(e) => setField(row.id, { completionStatus: e.target.value })}
                  >
                    {Object.entries(COMPLETION_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className={TD}>
                  <Input
                    type="date"
                    className="h-8 w-full px-2 text-[13px]"
                    value={row.startedAt}
                    onChange={(e) => setField(row.id, { startedAt: e.target.value })}
                  />
                </td>
                <td className={TD}>
                  <Input
                    type="date"
                    className="h-8 w-full px-2 text-[13px]"
                    value={row.endedAt}
                    onChange={(e) => setField(row.id, { endedAt: e.target.value })}
                  />
                </td>
                <td className={TD}>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    className="h-8 w-full px-2 text-right text-[13px]"
                    value={row.totalHours}
                    onChange={(e) => setField(row.id, { totalHours: e.target.value })}
                  />
                </td>
                <td className={TD}>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    className="h-8 w-full px-2 text-right text-[13px]"
                    value={row.completedHours}
                    onChange={(e) => setField(row.id, { completedHours: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
