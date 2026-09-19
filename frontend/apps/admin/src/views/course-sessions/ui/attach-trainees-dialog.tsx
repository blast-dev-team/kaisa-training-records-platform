import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Check, X } from "lucide-react";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import { Textarea } from "@/src/shared/ui/textarea";
import { getTraineeList, traineeQueries } from "@/src/entities/trainee";
import { useDebouncedValue } from "@/src/shared/hooks/use-debounced-value";
import { courseSessionQueries, type CourseSession } from "@/src/entities/course-session";
import {
  getTrainingRecordList,
  postTrainingRecordBulk,
  trainingRecordQueries,
} from "@/src/entities/training-record";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 고정 일정 — 이력 관리 역방향 등록에서는 선택 후 전달 */
  session: CourseSession | null;
}

/** 일정에 교육생 일괄 연결 — 저장 시 교육 이력이 생성된다 */
export function AttachTraineesDialog({ isOpen, onClose, session }: Props) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const search = useDebouncedValue(searchInput.trim(), 300);
  const [hours, setHours] = useState("");
  const [memo, setMemo] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setDropdownOpen(false);
      return;
    }
    setSearchInput("");
    setSelected({});
    setHours(session?.recognizedHours != null ? String(session.recognizedHours) : "");
    setMemo("");
  }, [isOpen, session]);

  // 드롭다운 밖 클릭 시 닫기
  useEffect(() => {
    if (!dropdownOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!comboRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [dropdownOpen]);

  // 추가할 교육생 — 검색 + 무한 스크롤
  const traineeQuery = useInfiniteQuery({
    queryKey: [...traineeQueries.lists(), { search, limit: 30 }],
    queryFn: ({ pageParam }) =>
      getTraineeList({ q: search || undefined, page: pageParam, limit: 30 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: isOpen,
  });
  const trainees = traineeQuery.data?.pages.flatMap((p) => p.items) ?? [];

  // 이미 이 일정에 연결된 교육생 — 무한 스크롤
  const connectedQuery = useInfiniteQuery({
    queryKey: [...trainingRecordQueries.lists(), { sessionId: session?.id, limit: 10 }],
    queryFn: ({ pageParam }) =>
      getTrainingRecordList({ sessionId: session!.id, page: pageParam, limit: 10 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: isOpen && !!session,
  });
  const connected = connectedQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const connectedIds = new Set(connected.map((r) => r.traineeId));

  const connectedListRef = useRef<HTMLDivElement>(null);

  const onTraineeScroll = () => {
    const el = listRef.current;
    if (!el || !traineeQuery.hasNextPage || traineeQuery.isFetchingNextPage) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) traineeQuery.fetchNextPage();
  };
  const onConnectedScroll = () => {
    const el = connectedListRef.current;
    if (!el || !connectedQuery.hasNextPage || connectedQuery.isFetchingNextPage) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) connectedQuery.fetchNextPage();
  };

  const toggle = (id: string, name: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = name;
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: () =>
      postTrainingRecordBulk({
        session_id: session!.id,
        trainee_ids: Object.keys(selected),
        completed_hours: hours === "" ? null : Number(hours),
        memo: memo.trim() || null,
      }),
    onSuccess: ({ created, skipped }) => {
      toast.success(
        `교육 이력 ${created}건을 생성했어요${skipped > 0 ? ` (이미 연결됨 ${skipped}명 제외)` : ""}`,
      );
      queryClient.invalidateQueries({ queryKey: trainingRecordQueries.all() });
      queryClient.invalidateQueries({ queryKey: courseSessionQueries.all() });
      setSelected({});
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="교육생 연결"
      description={
        session
          ? `${session.courseName} · ${session.startedAt ?? "기간 미정"} — 선택한 교육생의 교육 이력이 생성돼요`
          : undefined
      }
      actions={[
        { label: "취소", onClick: onClose },
        {
          label: `${Object.keys(selected).length}명 연결`,
          isLoading: mutation.isPending,
          isDisabled: Object.keys(selected).length === 0,
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      <div className="space-y-3">
        {/* 이미 연결된 교육생 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>연결된 교육생</Label>
            <span className="text-[11px] text-ink-3">
              {connectedQuery.data?.pages[0]
                ? `${connectedQuery.data.pages[0].total.toLocaleString()}명`
                : ""}
            </span>
          </div>
          <div
            ref={connectedListRef}
            className="max-h-32 overflow-y-auto rounded-md border border-line bg-bg-2"
            onScroll={onConnectedScroll}
          >
            {connected.length === 0 && (
              <p className="p-3 text-[12px] text-ink-3">아직 연결된 교육생이 없어요</p>
            )}
            {connected.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[12px] last:border-b-0"
              >
                <span className="text-ink">{r.traineeName ?? "—"}</span>
                <span className="text-[11px] text-ink-3">{r.traineeNo}</span>
                <span className="ml-auto text-[11px] text-ink-3">
                  {r.completedHours ?? "—"}시수 · {r.startedAt ?? "기간미정"}
                </span>
              </div>
            ))}
            {connectedQuery.isFetchingNextPage && (
              <p className="p-1.5 text-center text-[11px] text-ink-3">불러오는 중…</p>
            )}
          </div>
        </div>

        {/* 추가할 교육생 — 클릭 시 드롭다운, 선택은 칩으로 표시 */}
        <div className="space-y-1.5">
          <Label>교육생 추가</Label>
          <div ref={comboRef} className="relative">
            <Input
              placeholder="클릭해서 교육생 검색 · 선택"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={() => setDropdownOpen(true)}
            />
            {dropdownOpen && (
              <div className="absolute z-30 mt-1 w-full rounded-md border border-line bg-white shadow-lg">
                <div
                  ref={listRef}
                  className="max-h-56 overflow-y-auto"
                  onScroll={onTraineeScroll}
                >
                  {!traineeQuery.isPending && trainees.length === 0 && (
                    <p className="p-3 text-[13px] text-ink-3">조건에 맞는 교육생이 없어요</p>
                  )}
                  {trainees.map((t) => {
                    const checked = t.id in selected;
                    const already = connectedIds.has(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex cursor-pointer items-center gap-2.5 border-b border-line px-3 py-2 text-[13px] last:border-b-0 hover:bg-bg-2 ${
                          already ? "opacity-45" : ""
                        }`}
                      >
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                            checked ? "border-accent bg-accent" : "border-line"
                          }`}
                        >
                          {checked && <Check className="size-3 text-white" />}
                        </span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggle(t.id, t.name)}
                        />
                        <span className="text-ink">{t.name}</span>
                        <span className="text-[11px] text-ink-3">{t.traineeNo}</span>
                        {already && (
                          <span className="ml-auto text-[11px] text-ink-3">연결됨</span>
                        )}
                      </label>
                    );
                  })}
                  {traineeQuery.isFetchingNextPage && (
                    <p className="p-1.5 text-center text-[12px] text-ink-3">불러오는 중…</p>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* 선택된 교육생 칩 */}
          {Object.keys(selected).length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(selected).map(([id, name]) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full border border-accent-soft bg-accent-soft px-2.5 py-0.5 text-[12px] font-medium text-accent-ink"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => toggle(id, name)}
                    className="text-accent-ink/60 hover:text-accent-ink"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-col gap-1.5">
            <Label>이수 시수</Label>
            <Input type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} />
            <p className="text-[11px] text-ink-3">기본값: 일정 인정 시수</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>메모</Label>
            <Textarea
              rows={2}
              placeholder="선택"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
