import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import type { ColumnDef } from "@tanstack/react-table";
import { Award, CalendarPlus, FileDown, Pencil, Plus, Trash2 } from "lucide-react";
import { AppTable } from "@/src/shared/ui/app-table";
import { Button } from "@/src/shared/ui/button";
import { Dialog } from "@/src/shared/ui/dialog";
import { FilterBar, FilterRow } from "@/src/shared/ui/filter-bar";
import { PageContainer } from "@/src/shared/ui/page-container";
import { PageHead } from "@/src/shared/ui/page-head";
import { Pill, statusTone } from "@/src/shared/ui/pill";
import { SearchableSelect, fetchOptions } from "@/src/shared/ui/searchable-select";
import { Input } from "@/src/shared/ui/input";
import { Select } from "@/src/shared/ui/select";
import { cn } from "@/src/shared/utils/cn";
import { formatNumber, todayYMD, yearsAgoYMD } from "@/src/shared/utils/format";
import {
  deleteTrainingRecord,
  deleteTrainingRecordBulk,
  postCompletionCertificatesIssue,
  trainingRecordQueries,
  COMPLETION_STATUS_LABELS,
  TRAINING_SOURCE_LABELS,
  type CompletionCertificate,
  type TrainingRecord,
} from "@/src/entities/training-record";
import { traineeQueries } from "@/src/entities/trainee";
import { TrainingRecordFormDialog } from "./training-record-form-dialog";
import { TrainingRecordBulkEditDialog } from "./training-record-bulk-edit-dialog";
import { CertificatePreviewModal } from "./certificate-preview-modal";
import { CompletionCertificateModal } from "./completion-certificate-modal";
import { SessionPickerDialog } from "@/src/views/course-sessions/ui/session-picker-dialog";
import { AttachTraineesDialog } from "@/src/views/course-sessions/ui/attach-trainees-dialog";
import type { CourseSession } from "@/src/entities/course-session";

interface Props {
  /** 'external' 이면 외부 수료 전용 뷰 — source 고정, 등록 기본값 external */
  variant?: "all" | "external";
}

/** 수료증 발급 자격 — 내부 기관의 수료 완료 내역만 */
const canIssueCompletion = (record: TrainingRecord) =>
  record.institutionType === "internal" && record.completionStatus === "completed";

/** 조회기간 칩 — 레거시 프로그램(전체·최근 3년·최근 1년) 이식. 'all'이 기본이라 URL 키 생략 */
const PERIOD_CHIPS = [
  { key: "all", label: "전체" },
  { key: "recent3y", label: "최근 3년" },
  { key: "recent1y", label: "최근 1년" },
] as const;
type PeriodChip = (typeof PERIOD_CHIPS)[number]["key"];

/** 교육생 선택 드롭다운 옵션 — 성명 검색, 보조 표기는 교육생번호 */
const traineeOptionsFetcher = fetchOptions("/trainees", {}, (t) => ({
  value: t.id as string,
  label: t.name as string,
  hint: (t.trainee_no as string | null) ?? undefined,
}));

export function TrainingRecordListPage({ variant = "all" }: Props) {
  const isExternal = variant === "external";
  const [searchParams, setSearchParams] = useSearchParams();
  const traineeId = searchParams.get("trainee_id") ?? "";
  const source = isExternal ? "external" : (searchParams.get("source") ?? "");
  const status = searchParams.get("status") ?? "";
  const q = searchParams.get("q") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  // 조회기간 칩 — from/to 직접 지정 시 칩은 해제된다 (web 교육이력과 동일 패턴)
  const period = (searchParams.get("period") as PeriodChip | null) ?? "all";
  // 정렬 — 수강기간순이 기본. 등록순은 이관 데이터가 등록 시각이 없어 실등록분만 본다
  const sort = searchParams.get("sort") === "registration" ? "registration" : "period";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const limit = Math.max(1, Number(searchParams.get("limit") ?? 10) || 10);

  const [searchInput, setSearchInput] = useState(q);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TrainingRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrainingRecord | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachSession, setAttachSession] = useState<CourseSession | null>(null);

  /**
   * 칩 기간의 실효 조회 범위 — 쿼리·date input에 그대로 노출된다.
   * URL에 from/to가 있으면 그 값이 우선(직접 지정), 없으면 칩 기간으로 오늘 기준 역산.
   * 렌더마다 재계산 — '오늘'을 굳히지 않는다 (timezone.md).
   */
  const defaultFrom =
    period === "recent1y" ? yearsAgoYMD(1) : period === "recent3y" ? yearsAgoYMD(3) : "";
  const effFrom = from || defaultFrom;
  const effTo = to || (period === "all" ? "" : todayYMD());

  // 확인서 PDF 발급 — 체크박스 선택(페이지 이동 간 유지) + 모달 미리보기 후 다운로드
  const [selected, setSelected] = useState<Map<string, TrainingRecord>>(new Map());
  const [previewRecords, setPreviewRecords] = useState<TrainingRecord[] | null>(null);
  // 수료증 발급 — 발급 응답(번호 포함)으로 미리보기 모달
  const [issuedCertificates, setIssuedCertificates] = useState<
    CompletionCertificate[] | null
  >(null);
  // 일괄 수정 모달 — 체크박스 선택분. 저장 성공 시 선택 해제
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditRecords, setBulkEditRecords] = useState<TrainingRecord[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const { data } = useQuery(
    trainingRecordQueries.list({
      traineeId: traineeId || undefined,
      source: source || undefined,
      excludeSource: !isExternal ? "external" : undefined,
      completionStatus: status || undefined,
      search: q || undefined,
      dateFrom: effFrom || undefined,
      dateTo: effTo || undefined,
      sort,
      page,
      limit,
    }),
  );

  /** 행 클릭·체크박스 공용 토글 — 행 자체를 클릭해도 선택이 바뀐다 */
  const toggleRow = useCallback((record: TrainingRecord) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(record.id)) next.delete(record.id);
      else next.set(record.id, record);
      return next;
    });
  }, []);

  /** 선택된 교육생 이름 — 옵션 목록에 없어도 드롭다운에 표시 */
  const { data: selectedTrainee } = useQuery({
    ...traineeQueries.detail(traineeId),
    enabled: !!traineeId,
  });

  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTrainingRecord(id),
    onSuccess: () => {
      toast.success("이력을 삭제했어요");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: trainingRecordQueries.all() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => deleteTrainingRecordBulk(ids),
    onSuccess: (deleted) => {
      toast.success(`${deleted}건의 이력을 삭제했어요. 감사로그에는 남아 있어요`);
      setBulkDeleteOpen(false);
      setSelected(new Map());
      queryClient.invalidateQueries({ queryKey: trainingRecordQueries.all() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** 선택 중 수료증 발급 자격 건 — 일괄 발급 버튼 활성·대상 계산에 쓴다 */
  const eligibleRecords = [...selected.values()].filter(canIssueCompletion);

  // 수료증 발급 — 서버에 문서 생성(번호 채번) → 응답으로 미리보기 모달
  const issueCompletionMutation = useMutation({
    mutationFn: (ids: string[]) =>
      postCompletionCertificatesIssue({ training_record_ids: ids }),
    onSuccess: (certificates) => {
      setIssuedCertificates(certificates);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete("page");
    setSearchParams(next, { replace: false });
  };

  const columns = useMemo<ColumnDef<TrainingRecord, unknown>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => {
          const pageRows = table.getCoreRowModel().rows;
          const pageIds = pageRows.map((r) => r.original.id);
          const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
          return (
            <input
              type="checkbox"
              className="size-4 accent-accent cursor-pointer"
              checked={allSelected}
              onChange={(e) => {
                const next = new Map(selected);
                for (const r of pageRows) {
                  if (e.target.checked) next.set(r.original.id, r.original);
                  else next.delete(r.original.id);
                }
                setSelected(next);
              }}
            />
          );
        },
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="size-4 accent-accent cursor-pointer"
            checked={selected.has(row.original.id)}
            onChange={(e) => {
              const next = new Map(selected);
              if (e.target.checked) next.set(row.original.id, row.original);
              else next.delete(row.original.id);
              setSelected(next);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        meta: { width: 50 },
      },
      {
        accessorKey: "courseName",
        header: "과정명",
        meta: { width: 320 },
        cell: ({ row }) => (
          <span className="font-medium text-ink" title={row.original.courseName}>
            {row.original.courseName}
          </span>
        ),
      },
      {
        accessorKey: "institutionName",
        header: "기관",
        meta: { width: 180 },
        cell: ({ row }) => (
          <span title={row.original.institutionName ?? undefined}>
            {row.original.institutionName ?? "—"}
          </span>
        ),
      },
      {
        id: "trainee",
        header: "감리원",
        meta: { width: 100 },
        cell: ({ row }) => (
          <span>
            <span className="text-ink">{row.original.traineeName ?? "—"}</span>
          </span>
        ),
      },
      {
        id: "supervisorCertNo",
        header: "자격증번호",
        meta: { width: 200 },
        cell: ({ row }) => row.original.supervisorCertNo ?? "—",
      },
      {
        accessorKey: "traineeBirthDate",
        header: "생년월일",
        meta: { width: 110 },
        cell: ({ row }) => row.original.traineeBirthDate ?? "—",
      },
      {
        id: "hours",
        header: "시수",
        meta: { width: 90, align: "right" },
        cell: ({ row }) => {
          const { completedHours, totalHours } = row.original;
          if (completedHours === null && totalHours === null) return "—";
          return `${completedHours ?? "—"}/${totalHours ?? "—"}`;
        },
      },
      {
        id: "period",
        header: "기간",
        meta: { width: 200 },
        cell: ({ row }) => {
          const s = row.original.startedAt;
          const e = row.original.endedAt;
          if (!s && !e) return "—";
          return `${s ?? "?"} ~ ${e ?? "진행중"}`;
        },
      },
      {
        id: "actions",
        header: "",
        // PDF·수료증 아이콘 버튼 각 ~68px + 수정·삭제 각 48px + gap 18px + 셀 패딩 32px = 262px — 그래서 270.
        meta: { width: 270, align: "right" },
        cell: ({ row }) => {
          const eligible = canIssueCompletion(row.original);
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewRecords([row.original]);
                }}
              >
                <FileDown className="size-3.5" /> PDF
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!eligible}
                title={
                  eligible
                    ? undefined
                    : "내부 기관의 수료 완료 내역만 발급할 수 있어요"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  issueCompletionMutation.mutate([row.original.id]);
                }}
              >
                <Award className="size-3.5" /> 수료증
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditTarget(row.original);
                  setFormOpen(true);
                }}
              >
                수정
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:text-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(row.original);
                }}
              >
                삭제
              </Button>
            </div>
          );
        },
      },
    ],
    // toggleRow 는 useCallback([]) 로 안정적이라 deps 제외
    [isExternal, selected],
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  /** 현재 필터(기간·검색·교육생) 전체의 시수 합계 — 현재 페이지 합이 아님 (BE SUM) */
  const hoursSum = data?.totalHoursSum ?? 0;

  return (
    <PageContainer>
      <PageHead
        title={isExternal ? "외부 이력 관리" : "교육 내역 관리"}
        subtitle={`총 ${total.toLocaleString()}건`}
        actions={
          <div className="flex items-center gap-2">
            {!isExternal && (
              <Button variant="outline" onClick={() => setPickerOpen(true)}>
                <CalendarPlus className="size-4" /> 일정으로 등록
              </Button>
            )}
            <Button
              onClick={() => {
                setEditTarget(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" /> 이력 등록
            </Button>
          </div>
        }
      />

      <FilterBar>
        <FilterRow label="감리원">
          <SearchableSelect
            className="w-64"
            value={traineeId || null}
            onChange={(v) => updateParams({ trainee_id: v })}
            fetchPage={traineeOptionsFetcher}
            placeholder="성명(전체)으로 검색 후 선택"
            clearable
            disableCreate
            queryKeyPrefix={["options", "trainees"]}
            // 동명이인 구분 — 선택 후에도 어떤 감리원인지 번호로 보이게
            selectedLabel={
              selectedTrainee?.traineeNo
                ? `${selectedTrainee.name} (${selectedTrainee.traineeNo})`
                : selectedTrainee?.name
            }
          />
        </FilterRow>
        <FilterRow label="검색">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              updateParams({ q: searchInput.trim() || null });
            }}
          >
            <Input
              className="w-64"
              placeholder="과정명 · 기관명 · 감리원 성명(전체)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Button type="submit" variant="secondary" size="sm">
              검색
            </Button>
          </form>
        </FilterRow>
        <FilterRow label="정렬">
          <Select
            className="w-32"
            value={sort}
            onChange={(e) => updateParams({ sort: e.target.value === "registration" ? e.target.value : null })}
          >
            <option value="period">수강기간순</option>
            <option value="registration">등록순</option>
          </Select>
        </FilterRow>
        <FilterRow label="기간">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                className="w-36"
                value={effFrom}
                onChange={(e) => updateParams({ from: e.target.value || null, period: null })}
              />
              <span className="text-ink-3">~</span>
              <Input
                type="date"
                className="w-36"
                value={effTo}
                min={effFrom || undefined}
                onChange={(e) => updateParams({ to: e.target.value || null, period: null })}
              />
            </div>
            {/* 조회기간 칩 — 직접 지정 시 칩은 해제 (web 교육이력과 동일) */}
            <div className="flex gap-1.5">
              {PERIOD_CHIPS.map((chip) => {
                const active = (from || to ? null : period) === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      updateParams({
                        from: null,
                        to: null,
                        period: chip.key === "all" ? null : chip.key,
                      })
                    }
                    className={cn(
                      "cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                      active
                        ? "bg-ink text-white"
                        : "border border-line bg-panel text-ink-2 hover:text-ink",
                    )}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
        </FilterRow>
      </FilterBar>

      {/* 등록순 안내 — 이관(미러링) 데이터는 created_at 이 일괄 반영되어 등록순의 의미가 없다.
          서버가 2026-09-01 이후 실등록분만 내려주므로 그 사실을 그대로 알려준다 */}
      {sort === "registration" && (
        <div className="flex w-full items-start rounded-md border-l-4 border-solid border-accent bg-accent-soft px-4 py-2.5">
          <p className="flex-1 text-[13px] leading-[1.6] text-ink-2">
            등록순은 <b className="font-semibold text-ink">2026년 9월 이후 등록된 내역</b>만
            보여줘요 — 그 이전 데이터는 시스템 이관으로 일괄 등록되어 실제 등록 순서가 없어요.
            이관 데이터는 수강기간순으로 확인해 주세요.
          </p>
        </div>
      )}

      {/* 총 수료시간 — 교육생 필터가 있을 때만. 없으면 전체 교육생 합계라 의미가 없다 (레거시 총계 위치) */}
      {traineeId && (
        <div className="mb-1 flex items-baseline gap-1.5">
          <span className="text-sm text-ink-2">총 수료시간</span>
          <span className="text-sm font-semibold text-ink">{formatNumber(hoursSum)}</span>
          <span className="text-sm text-ink-2">시간</span>
        </div>
      )}

      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-2.5">
          <span className="text-sm text-ink-2">선택 {selected.size}건</span>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Map())}>
            선택 해제
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBulkEditRecords([...selected.values()]);
              setBulkEditOpen(true);
            }}
          >
            <Pencil className="size-3.5" /> 일괄 수정
          </Button>
          <Button size="sm" onClick={() => setPreviewRecords([...selected.values()])}>
            <FileDown className="size-4" /> 확인서 미리보기
          </Button>
          <Button
            size="sm"
            disabled={eligibleRecords.length === 0}
            title={
              eligibleRecords.length === 0
                ? "선택 내역 중 내부 기관 수료 완료 건이 없어요"
                : undefined
            }
            onClick={() => {
              const excluded = selected.size - eligibleRecords.length;
              if (excluded > 0) {
                toast.info(
                  `내부 기관 수료 완료 건만 발급해요 — ${excluded}건은 제외했어요`,
                );
              }
              issueCompletionMutation.mutate(eligibleRecords.map((r) => r.id));
            }}
          >
            <Award className="size-4" /> 수료증 발급
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 className="size-3.5" /> 일괄 삭제
          </Button>
        </div>
      )}

      <AppTable
        columns={columns}
        data={items}
        isLoading={!data}
        onRowClick={toggleRow}
        emptyMessage={
          traineeId && selectedTrainee
            ? `${selectedTrainee.name}(${selectedTrainee.traineeNo ?? "미지정"}) 감리원의 교육내역이 없어요`
            : isExternal
              ? "등록된 외부 수료 내역이 없어요"
              : "조건에 맞는 교육내역이 없어요"
        }
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) }, false)}
        limit={limit}
        onLimitChange={(n) => updateParams({ limit: String(n) })}
        paginationInfo={`총 ${total.toLocaleString()}건 · ${page}/${totalPages}페이지`}
        columnDividers
        fixedLayout
      />

      <TrainingRecordFormDialog
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        record={editTarget}
        defaultSource={isExternal ? "external" : "internal"}
      />

      <CertificatePreviewModal
        isOpen={previewRecords !== null}
        onClose={() => setPreviewRecords(null)}
        records={previewRecords ?? []}
      />

      <CompletionCertificateModal
        isOpen={issuedCertificates !== null}
        onClose={() => setIssuedCertificates(null)}
        certificates={issuedCertificates}
      />

      <TrainingRecordBulkEditDialog
        isOpen={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        records={bulkEditRecords}
        onSaved={() => setSelected(new Map())}
      />

      <SessionPickerDialog
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(session) => setAttachSession(session)}
      />
      <AttachTraineesDialog
        isOpen={attachSession !== null}
        onClose={() => setAttachSession(null)}
        session={attachSession}
      />

      <Dialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="내역 삭제"
        description={
          deleteTarget
            ? `${deleteTarget.traineeName ?? ""}의 '${deleteTarget.courseName}' 내역을 삭제할까요? 삭제 후에도 감사로그에는 남아요.`
            : undefined
        }
        actions={[
          { label: "취소", onClick: () => setDeleteTarget(null) },
          {
            label: "삭제",
            variant: "danger",
            isLoading: deleteMutation.isPending,
            onClick: () => {
              if (!deleteTarget) return;
              deleteMutation.mutate(deleteTarget.id);
            },
          },
        ]}
      />

      <Dialog
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title="내역 일괄 삭제"
        description={`선택한 ${selected.size.toLocaleString()}건의 내역을 삭제할까요? 삭제 후에도 감사로그에는 남아요.`}
        actions={[
          { label: "취소", onClick: () => setBulkDeleteOpen(false) },
          {
            label: `${selected.size.toLocaleString()}건 삭제`,
            variant: "danger",
            isLoading: bulkDeleteMutation.isPending,
            onClick: () => bulkDeleteMutation.mutate([...selected.keys()]),
          },
        ]}
      />
    </PageContainer>
  );
}
