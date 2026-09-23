import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Check, ChevronDown, ChevronUp, FileSpreadsheet, X } from "lucide-react";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import { Textarea } from "@/src/shared/ui/textarea";
import { getTraineeList, postTrainee, traineeQueries } from "@/src/entities/trainee";
import { useDebouncedValue } from "@/src/shared/hooks/use-debounced-value";
import { courseSessionQueries, type CourseSession } from "@/src/entities/course-session";
import {
  getTrainingRecordList,
  postTrainingRecordBulk,
  postTrainingRecordMatchPreview,
  trainingRecordQueries,
  type MatchPreviewMatched,
  type MatchPreviewUnmatched,
  type TraineeMatchPreviewResult,
} from "@/src/entities/training-record";

/** 엑셀 대조 매칭 키 라벨 */
const MATCHED_BY_LABELS: Record<string, string> = {
  cert_no: "증번호 매칭",
  trainee_no: "번호 매칭",
  name: "이름 매칭",
};

/** 업로드한 대조 파일 1개의 결과 */
interface MatchUpload {
  fileName: string;
  result: TraineeMatchPreviewResult;
}

interface MergedMatchResult {
  fileCount: number;
  totalRows: number;
  matched: MatchPreviewMatched[];
  /** 파일이 여러 개면 행번호가 겹치므로 파일 인덱스를 섞은 key 를 붙인다 */
  unmatched: (MatchPreviewUnmatched & { key: string })[];
}

/** 미매칭 행 직접 등록 — 이름 외 상세 입력값 */
interface DirectAddDetail {
  phone: string;
  birthDate: string;
  certNo: string;
}

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
  const [uploads, setUploads] = useState<MatchUpload[]>([]);
  /** 미매칭 행 이름 직접 수정용 초안 — key → 이름 */
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  /** 직접 등록으로 신규 감리원을 만들어 선택까지 마친 미매칭 행 key */
  const [addedRows, setAddedRows] = useState<Set<string>>(new Set());
  /** 직접 등록 시 상세 입력(전화번호·생년월일·증번호) 펼친 행 */
  const [detailOpen, setDetailOpen] = useState<Set<string>>(new Set());
  /** 상세 입력 초안 — key → 값 */
  const [draftDetails, setDraftDetails] = useState<Record<string, DirectAddDetail>>({});
  // 파일 여러 개 누적 대조 — 매칭은 id 중복 제거, 미매칭 행은 파일별로 모두 보여준다
  const merged = useMemo<MergedMatchResult | null>(() => {
    if (uploads.length === 0) return null;
    const seen = new Set<string>();
    const matched: MatchPreviewMatched[] = [];
    const unmatched: MergedMatchResult["unmatched"] = [];
    let totalRows = 0;
    uploads.forEach((up, fi) => {
      totalRows += up.result.total_rows;
      for (const m of up.result.matched) {
        if (seen.has(m.trainee_id)) continue;
        seen.add(m.trainee_id);
        matched.push(m);
      }
      for (const u of up.result.unmatched) {
        unmatched.push({ ...u, key: `${fi}-${u.row_number}` });
      }
    });
    return { fileCount: uploads.length, totalRows, matched, unmatched };
  }, [uploads]);
  const comboRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 드롭다운 위치 — 인풋 기준 fixed 좌표. flipUp = 아래 공간 부족해 위로 펼침 */
  const [dropdownPos, setDropdownPos] = useState<{
    left: number;
    top: number;
    inputTop: number;
    width: number;
    flipUp: boolean;
  } | null>(null);

  // 인풋 아래 공간이 부족하면 위로 펼친다 — 모달 본문 스크롤 높이를 늘리지 않기 위해 body 로 포털
  const updateDropdownPos = useCallback(() => {
    const rect = comboRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDropdownPos({
      left: rect.left,
      top: rect.bottom + 4,
      inputTop: rect.top,
      width: rect.width,
      flipUp: window.innerHeight - rect.bottom < 240,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setDropdownOpen(false);
      setDropdownPos(null);
      return;
    }
    setSearchInput("");
    setSelected({});
    setHours(session?.recognizedHours != null ? String(session.recognizedHours) : "");
    setMemo("");
    setUploads([]);
    setDraftNames({});
    setAddedRows(new Set());
    setDetailOpen(new Set());
    setDraftDetails({});
  }, [isOpen, session]);

  // 드롭다운 밖 클릭 시 닫기 — 포털 안쪽 클릭은 유지
  useEffect(() => {
    if (!dropdownOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!comboRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setDropdownOpen(false);
        setDropdownPos(null);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [dropdownOpen]);

  // 모달 본문 스크롤·창 크기 변화에 따라 위치 추적
  useEffect(() => {
    if (!dropdownOpen) return;
    window.addEventListener("scroll", updateDropdownPos, true);
    window.addEventListener("resize", updateDropdownPos);
    return () => {
      window.removeEventListener("scroll", updateDropdownPos, true);
      window.removeEventListener("resize", updateDropdownPos);
    };
  }, [dropdownOpen, updateDropdownPos]);

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

  const toggleDetail = (key: string) => {
    setDetailOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
        `교육 내역 ${created}건을 생성했어요${skipped > 0 ? ` (이미 연결됨 ${skipped}명 제외)` : ""}`,
      );
      queryClient.invalidateQueries({ queryKey: trainingRecordQueries.all() });
      queryClient.invalidateQueries({ queryKey: courseSessionQueries.all() });
      setSelected({});
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const matchMutation = useMutation({
    mutationFn: (file: File) => postTrainingRecordMatchPreview(file),
    onSuccess: (result, file) => {
      setUploads((prev) => [...prev, { fileName: file.name, result }]);
      const connectedCount = result.matched.filter((m) => connectedIds.has(m.trainee_id)).length;
      setSelected((prev) => {
        const next = { ...prev };
        for (const m of result.matched) {
          if (connectedIds.has(m.trainee_id)) continue;
          next[m.trainee_id] = m.name;
        }
        return next;
      });
      toast.success(
        `${result.total_rows}행 중 ${result.matched.length}명 매칭 · 미매칭 ${result.unmatched.length}행${
          connectedCount > 0 ? ` · 이미 연결됨 ${connectedCount}명 제외` : ""
        }`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // 미매칭 행 → 이름·전화번호·생년월일·증번호 직접 입력으로 신규 감리원 등록 + 즉시 선택.
  // 엑셀 증번호는 매칭에 실패한 값이라 새 감리원에 자동으로 옮기지 않는다
  const createMutation = useMutation({
    mutationFn: (vars: {
      rowKey: string;
      name: string;
      phone: string;
      birthDate: string;
      certNo: string | null;
    }) =>
      postTrainee({
        name: vars.name.trim(),
        phone: vars.phone.trim() || undefined,
        birth_date: vars.birthDate || undefined,
        cert_no: vars.certNo,
      }),
    onSuccess: (trainee, vars) => {
      queryClient.invalidateQueries({ queryKey: traineeQueries.all() });
      setSelected((prev) => (trainee.id in prev ? prev : { ...prev, [trainee.id]: trainee.name }));
      setAddedRows((prev) => new Set(prev).add(vars.rowKey));
      toast.success(`'${trainee.name}' 감리원을 새로 등록하고 선택했어요`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="감리원 연결"
      description={
        session
          ? `${session.courseName} · ${session.startedAt ?? "기간 미정"} — 선택한 감리원의 교육 내역이 생성돼요`
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
        {/* 이미 연결된 감리원 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>연결된 감리원</Label>
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
              <p className="p-3 text-[12px] text-ink-3">아직 연결된 감리원이 없어요</p>
            )}
            {connected.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[12px] last:border-b-0"
              >
                <span className="text-ink">{r.traineeName ?? "—"}</span>
                <span className="text-[11px] text-ink-3">{r.traineeCertNo ?? "—"}</span>
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

        {/* 엑셀로 추가 — 파일 대조 후 매칭·미매칭 상세 확인 */}
        <div className="space-y-1.5">
          <Label>엑셀로 추가</Label>
          {merged ? (
            <div className="space-y-2.5 rounded-md border border-line p-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium text-ink">
                  파일 {merged.fileCount}개 · 총 {merged.totalRows}행 · 매칭 {merged.matched.length}
                  명 · 미매칭 {merged.unmatched.length}행
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[11px] text-accent hover:underline"
                  disabled={matchMutation.isPending}
                >
                  {matchMutation.isPending ? "대조 중..." : "엑셀 추가"}
                </button>
              </div>
              <p className="truncate text-[11px] text-ink-3">
                {uploads.map((u) => u.fileName).join(" · ")}
              </p>
              {/* 매칭된 감리원 — 대조 키와 함께 상세 표시 */}
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-ink-2">
                  매칭된 감리원 {merged.matched.length}명
                </p>
                <div className="max-h-40 overflow-y-auto rounded-md border border-line">
                  {merged.matched.map((m) => (
                    <div
                      key={m.trainee_id}
                      className="flex items-center gap-2 border-b border-line px-2.5 py-1.5 text-[12px] last:border-b-0"
                    >
                      <span className="text-ink">{m.name}</span>
                      {m.cert_no && (
                        <span className="truncate text-[11px] text-ink-3">{m.cert_no}</span>
                      )}
                      <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        <span className="rounded-full bg-bg-2 px-1.5 py-0.5 text-[10px] text-ink-3">
                          {MATCHED_BY_LABELS[m.matched_by] ?? m.matched_by}
                        </span>
                        {connectedIds.has(m.trainee_id) && (
                          <span className="text-[11px] text-ink-3">연결됨</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {/* 미매칭 행 — 못 찾은 행은 이름 직접 입력으로 신규 등록·선택 가능 */}
              {merged.unmatched.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-warn-ink">
                    미매칭 {merged.unmatched.length}행 — 이름을 고쳐 직접 등록하거나 아래 검색으로
                    수동 추가할 수 있어요
                  </p>
                  <div className="max-h-40 overflow-y-auto rounded-md border border-warn-soft bg-warn-soft/40">
                    {merged.unmatched.map((u) => {
                      const canDirectAdd = u.reason === "교육생 목록에서 찾을 수 없어요";
                      const added = addedRows.has(u.key);
                      return (
                        <div key={u.key} className="px-2.5 py-1.5">
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className="w-9 shrink-0 text-ink-3">{u.row_number}행</span>
                            {added ? (
                              <span className="text-ink">
                                {draftNames[u.key] ?? u.name ?? "—"}
                                <span className="ml-1.5 text-[11px] text-ok">등록·선택됨</span>
                              </span>
                            ) : canDirectAdd ? (
                              <>
                                <input
                                  className="h-6 min-w-0 flex-1 rounded border border-line bg-white px-1.5 text-[12px]"
                                  value={draftNames[u.key] ?? u.name ?? ""}
                                  onChange={(e) =>
                                    setDraftNames((prev) => ({
                                      ...prev,
                                      [u.key]: e.target.value,
                                    }))
                                  }
                                />
                                <button
                                  type="button"
                                  className={`flex shrink-0 items-center gap-0.5 text-[11px] transition-colors ${
                                    detailOpen.has(u.key)
                                      ? "text-accent"
                                      : "text-ink-3 hover:text-accent"
                                  }`}
                                  onClick={() => toggleDetail(u.key)}
                                >
                                  {detailOpen.has(u.key) ? (
                                    <ChevronUp className="size-3" />
                                  ) : (
                                    <ChevronDown className="size-3" />
                                  )}
                                  상세
                                </button>
                                <button
                                  type="button"
                                  className="shrink-0 rounded-md border border-line px-2 py-0.5 text-[11px] text-ink-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-45"
                                  disabled={
                                    createMutation.isPending ||
                                    (draftNames[u.key] ?? u.name ?? "").trim() === ""
                                  }
                                  onClick={() =>
                                    createMutation.mutate({
                                      rowKey: u.key,
                                      name: draftNames[u.key] ?? u.name ?? "",
                                      phone: draftDetails[u.key]?.phone ?? "",
                                      birthDate: draftDetails[u.key]?.birthDate ?? "",
                                      certNo: draftDetails[u.key]?.certNo.trim() || null,
                                    })
                                  }
                                >
                                  {createMutation.isPending ? "등록 중..." : "등록 후 추가"}
                                </button>
                              </>
                            ) : (
                              <span className="text-ink">{u.name ?? "—"}</span>
                            )}
                          </div>
                          {/* 상세 입력 — 전화번호·생년월일·증번호 */}
                          {detailOpen.has(u.key) && canDirectAdd && !added && (
                            <div className="mt-1 grid grid-cols-1 gap-1.5 pl-11">
                              <input
                                className="h-6 min-w-0 rounded border border-line bg-white px-1.5 text-[12px]"
                                placeholder="전화번호"
                                value={draftDetails[u.key]?.phone ?? ""}
                                onChange={(e) =>
                                  setDraftDetails((prev) => ({
                                    ...prev,
                                    [u.key]: {
                                      phone: e.target.value,
                                      birthDate: draftDetails[u.key]?.birthDate ?? "",
                                      certNo: draftDetails[u.key]?.certNo ?? "",
                                    },
                                  }))
                                }
                              />
                              <input
                                className="h-6 min-w-0 rounded border border-line bg-white px-1.5 text-[12px]"
                                type="date"
                                placeholder="생년월일"
                                value={draftDetails[u.key]?.birthDate ?? ""}
                                onChange={(e) =>
                                  setDraftDetails((prev) => ({
                                    ...prev,
                                    [u.key]: {
                                      phone: draftDetails[u.key]?.phone ?? "",
                                      birthDate: e.target.value,
                                      certNo: draftDetails[u.key]?.certNo ?? "",
                                    },
                                  }))
                                }
                              />
                              <input
                                className="h-6 min-w-0 rounded border border-line bg-white px-1.5 text-[12px]"
                                placeholder="감리원증번호"
                                value={draftDetails[u.key]?.certNo ?? ""}
                                onChange={(e) =>
                                  setDraftDetails((prev) => ({
                                    ...prev,
                                    [u.key]: {
                                      phone: draftDetails[u.key]?.phone ?? "",
                                      birthDate: draftDetails[u.key]?.birthDate ?? "",
                                      certNo: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>
                          )}
                          <p className="mt-0.5 pl-11 text-[11px] text-ink-3">{u.reason}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={matchMutation.isPending}
              className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-line px-4 py-6 text-ink-3 transition-colors hover:border-accent hover:text-accent cursor-pointer"
            >
              <FileSpreadsheet className="size-7" />
              <span className="text-[13px]">
                {matchMutation.isPending ? "대조 중..." : "클릭해서 엑셀 파일 선택 · 즉시 대조"}
              </span>
              <span className="text-[11px] text-ink-3">
                헤더: 감리원명 · 감리원증번호 (순서 무관, 이름만 있어도 가능)
              </span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) matchMutation.mutate(file);
              e.target.value = "";
            }}
          />
        </div>
        {/* 추가할 감리원 — 클릭 시 드롭다운, 선택은 칩으로 표시 */}
        <div className="space-y-1.5">
          <Label>감리원 추가</Label>
          <div ref={comboRef} className="relative">
            <Input
              placeholder="클릭해서 감리원 검색 · 선택"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={() => {
                updateDropdownPos();
                setDropdownOpen(true);
              }}
            />
            {dropdownOpen &&
              dropdownPos &&
              createPortal(
                <div
                  ref={dropdownRef}
                  className="fixed z-[1200] rounded-md border border-line bg-white shadow-lg"
                  style={{
                    left: dropdownPos.left,
                    width: dropdownPos.width,
                    ...(dropdownPos.flipUp
                      ? { bottom: window.innerHeight - dropdownPos.inputTop + 4 }
                      : { top: dropdownPos.top }),
                  }}
                >
                  <div
                    ref={listRef}
                    className="max-h-56 overflow-y-auto"
                    onScroll={onTraineeScroll}
                  >
                    {!traineeQuery.isPending && trainees.length === 0 && (
                      <p className="p-3 text-[13px] text-ink-3">조건에 맞는 감리원이 없어요</p>
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
                </div>,
                document.body,
              )}
          </div>
          {/* 선택된 감리원 칩 */}
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
