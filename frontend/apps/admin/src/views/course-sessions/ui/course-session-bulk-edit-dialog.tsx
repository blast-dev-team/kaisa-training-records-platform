import { toUserMessage } from "@/src/shared/lib/friendly-error";
import { hoursError, isValidHours } from "@/src/shared/utils/hours";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { DateField } from "@/src/shared/ui/date-picker/date-field";
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
  isActive: boolean;
  memo: string;
}

const seedRow = (s: CourseSession): RowDraft => ({
  startedAt: s.startedAt ?? "",
  endedAt: s.endedAt ?? "",
  totalHours: s.totalHours != null ? String(s.totalHours) : "",
  isActive: s.isActive,
  memo: s.memo ?? "",
});

/** 원래 값과 다른 키만 담아 보낸다 — 변경 없는 행은 null */
const diffItem = (s: CourseSession, d: RowDraft): CourseSessionBulkUpdateItemInput | null => {
  const item: CourseSessionBulkUpdateItemInput = { id: s.id };
  // 기간은 비울 수 없는 칸 — 빈 칸은 '변경 없음'으로 본다 (서버도 null 을 거절)
  if (d.startedAt !== "" && d.startedAt !== (s.startedAt ?? "")) item.started_at = d.startedAt;
  if (d.endedAt !== "" && d.endedAt !== (s.endedAt ?? "")) item.ended_at = d.endedAt;
  // 시수는 비울 수 없는 칸 — 빈 칸은 '변경 없음'(예전엔 null 을 보내 서버 500으로 전체 실패)
  if (
    d.totalHours.trim() !== "" &&
    d.totalHours !== (s.totalHours != null ? String(s.totalHours) : "") &&
    isValidHours(d.totalHours)
  )
    item.total_hours = Number(d.totalHours);
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
  // 음수·숫자 아님·상한 초과 — 음수 시수는 외부교육 16시간 한도를 우회할 수 있었다
  const invalidHoursValues = sessions
    .map((s) => rows[s.id]?.totalHours ?? "")
    .filter((v) => v.trim() !== "" && !isValidHours(v));
  const hoursInvalid = invalidHoursValues.length > 0;
  // 기간·시수가 바뀌는 일정의 연결 교육 내역 — 저장하면 같은 값으로 함께 바뀐다
  const syncedRecordCount = changedItems.reduce((sum, item) => {
    const changesPeriodOrHours =
      item.started_at !== undefined || item.ended_at !== undefined || item.total_hours !== undefined;
    const enrolled = sessions.find((s) => s.id === item.id)?.enrolledCount ?? 0;
    return changesPeriodOrHours ? sum + enrolled : sum;
  }, 0);

  const mutation = useMutation({
    mutationFn: () => patchCourseSessionBulk({ items: changedItems }),
    onSuccess: (updated) => {
      toast.success(`${updated}개 일정을 수정했어요`);
      queryClient.invalidateQueries({ queryKey: courseSessionQueries.all() });
      onDone();
      onClose();
    },
    onError: (e: Error) => toast.error(toUserMessage(e)),
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
          isDisabled: dateInvalid || hoursInvalid || changedItems.length === 0,
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      <div className="space-y-3">
        <p className="text-12 text-ink-3">
          기간이나 총 시수를 바꾸면 그 일정에 연결된 교육 내역에도 같은 값이 반영돼요. 이미 발급된
          확인서는 바뀌지 않아요
        </p>
        {syncedRecordCount > 0 && (
          <p role="status" className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-12 text-warn-ink">
            저장하면 연결된 교육 내역 {syncedRecordCount.toLocaleString()}건의 기간·시수도 함께 바뀌어요
          </p>
        )}
        {dateInvalid && (
          <p className="text-12 text-danger">종료일이 시작일보다 앞선 일정이 있어요</p>
        )}
        {hoursInvalid && (
          <p role="alert" className="text-12 text-danger">
            {hoursError(invalidHoursValues[0], { label: "총 시수" })} ({invalidHoursValues.length}건)
          </p>
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
                <span className="text-13 font-semibold text-ink">{s.courseName}</span>
                <span className="text-11 text-ink-3">{s.institutionName}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label>시작일</Label>
                  <DateField
                    ariaLabel={`시작일 ${s.id}`}
                    value={d.startedAt}
                    onChange={(v) => {
                      setRow(s.id, { startedAt: v });
                      if (v && d.endedAt && v > d.endedAt) setRow(s.id, { endedAt: v });
                    }}
                    maxDate={d.endedAt || undefined}
                  />
                </div>
                <div className="space-y-1">
                  <Label>종료일</Label>
                  <DateField
                    ariaLabel={`종료일 ${s.id}`}
                    value={d.endedAt}
                    onChange={(v) => {
                      setRow(s.id, { endedAt: v });
                      if (v && d.startedAt && v < d.startedAt) setRow(s.id, { startedAt: v });
                    }}
                    minDate={d.startedAt || undefined}
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
              </div>
              <div className="mt-2 flex items-center gap-3">
                <label className="flex items-center gap-2 text-13 text-ink-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-[--color-accent]"
                    checked={d.isActive}
                    onChange={(e) => setRow(s.id, { isActive: e.target.checked })}
                  />
                  운영중
                </label>
                <Input
                  className="h-8 flex-1 text-12"
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
