import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import {
  courseSessionQueries,
  patchCourseSessionBulk,
  type CourseSession,
  type CourseSessionBulkUpdateItemInput,
} from "@/src/entities/course-session";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 일괄 수정 대상 — 선택한 일정들 */
  sessions: CourseSession[];
  onDone: () => void;
}

/** 모달 안에서 각 일정의 값을 개별로 고치고 한 번에 저장한다 */
interface RowDraft {
  startedAt: string;
  endedAt: string;
  totalHours: string;
  recognizedHours: string;
  isActive: boolean;
  memo: string;
}

const seedRow = (s: CourseSession): RowDraft => ({
  startedAt: s.startedAt ?? "",
  endedAt: s.endedAt ?? "",
  totalHours: s.totalHours != null ? String(s.totalHours) : "",
  recognizedHours: s.recognizedHours != null ? String(s.recognizedHours) : "",
  isActive: s.isActive,
  memo: s.memo ?? "",
});

/** 원래 값과 다른 키만 담아 보낸다 — 변경 없는 행은 null */
const diffItem = (s: CourseSession, d: RowDraft): CourseSessionBulkUpdateItemInput | null => {
  const item: CourseSessionBulkUpdateItemInput = { id: s.id };
  if (d.startedAt !== (s.startedAt ?? ""))
    item.started_at = d.startedAt === "" ? null : d.startedAt;
  if (d.endedAt !== (s.endedAt ?? "")) item.ended_at = d.endedAt === "" ? null : d.endedAt;
  if (d.totalHours !== (s.totalHours != null ? String(s.totalHours) : ""))
    item.total_hours = d.totalHours === "" ? null : Number(d.totalHours);
  if (d.recognizedHours !== (s.recognizedHours != null ? String(s.recognizedHours) : ""))
    item.recognized_hours = d.recognizedHours === "" ? null : Number(d.recognizedHours);
  if (d.isActive !== s.isActive) item.is_active = d.isActive;
  if (d.memo !== (s.memo ?? "")) item.memo = d.memo === "" ? null : d.memo;
  return Object.keys(item).length > 1 ? item : null;
};

export function CourseSessionBulkEditDialog({ isOpen, onClose, sessions, onDone }: Props) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Record<string, RowDraft>>({});

  useEffect(() => {
    if (!isOpen) return;
    const seeded: Record<string, RowDraft> = {};
    for (const s of sessions) seeded[s.id] = seedRow(s);
    setRows(seeded);
    // 열릴 때의 선택 목록을 그대로 시드 — 이후 sessions 참조 변화는 무시한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const setRow = (id: string, patch: Partial<RowDraft>) => {
    setRows((prev) => ({
      ...prev,
      [id]: {
        startedAt: "",
        endedAt: "",
        totalHours: "",
        recognizedHours: "",
        isActive: true,
        memo: "",
        ...prev[id],
        ...patch,
      },
    }));
  };

  const changedItems = useMemo(
    () =>
      sessions
        .map((s) => {
          const d = rows[s.id];
          return d ? diffItem(s, d) : null;
        })
        .filter((x): x is CourseSessionBulkUpdateItemInput => x !== null),
    [sessions, rows],
  );

  const dateInvalid = sessions.some((s) => {
    const d = rows[s.id];
    return !!d && d.startedAt !== "" && d.endedAt !== "" && d.endedAt < d.startedAt;
  });

  const mutation = useMutation({
    mutationFn: () => patchCourseSessionBulk({ items: changedItems }),
    onSuccess: (updated) => {
      toast.success(`${updated}개 일정을 수정했어요`);
      queryClient.invalidateQueries({ queryKey: courseSessionQueries.all() });
      onDone();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title="일괄 수정"
      description={`${sessions.length}개 일정을 개별로 수정해요. 저장하면 바뀐 값만 반영돼요`}
      actions={[
        { label: "취소", onClick: onClose },
        {
          label: `${changedItems.length}개 저장`,
          variant: "primary",
          isLoading: mutation.isPending,
          isDisabled: dateInvalid || changedItems.length === 0,
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      <div className="space-y-3">
        {dateInvalid && (
          <p className="text-[12px] text-danger">종료일이 시작일보다 앞선 일정이 있어요</p>
        )}
        {sessions.map((s) => {
          const d = rows[s.id];
          if (!d) return null;
          const rowInvalid = d.startedAt !== "" && d.endedAt !== "" && d.endedAt < d.startedAt;
          return (
            <div
              key={s.id}
              className={`rounded-lg border px-4 py-3 ${
                rowInvalid ? "border-danger" : "border-line"
              }`}
            >
              <div className="mb-4 flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink">{s.courseName}</span>
                <span className="text-[11px] text-ink-3">{s.institutionName}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label>시작일</Label>
                  <Input
                    type="date"
                    value={d.startedAt}
                    onChange={(e) => setRow(s.id, { startedAt: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>종료일</Label>
                  <Input
                    type="date"
                    value={d.endedAt}
                    min={d.startedAt || undefined}
                    onChange={(e) => setRow(s.id, { endedAt: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>총 시수</Label>
                  <Input
                    type="number"
                    min={0}
                    value={d.totalHours}
                    onChange={(e) => setRow(s.id, { totalHours: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>인정 시수</Label>
                  <Input
                    type="number"
                    min={0}
                    value={d.recognizedHours}
                    onChange={(e) => setRow(s.id, { recognizedHours: e.target.value })}
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <label className="flex items-center gap-2 text-[13px] text-ink-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-[--color-accent]"
                    checked={d.isActive}
                    onChange={(e) => setRow(s.id, { isActive: e.target.checked })}
                  />
                  운영중
                </label>
                <Input
                  className="h-8 flex-1 text-[12px]"
                  placeholder="메모 (선택)"
                  value={d.memo}
                  onChange={(e) => setRow(s.id, { memo: e.target.value })}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
