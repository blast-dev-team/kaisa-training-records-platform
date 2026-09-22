import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import type { ColumnDef } from "@tanstack/react-table";
import { PencilLine, Plus, Trash2, Users } from "lucide-react";
import { AppTable } from "@/src/shared/ui/app-table";
import { Button } from "@/src/shared/ui/button";
import { Dialog } from "@/src/shared/ui/dialog";
import { FilterBar, FilterRow } from "@/src/shared/ui/filter-bar";
import { Input } from "@/src/shared/ui/input";
import { PageContainer } from "@/src/shared/ui/page-container";
import { PageHead } from "@/src/shared/ui/page-head";
import { Pill } from "@/src/shared/ui/pill";
import { Select } from "@/src/shared/ui/select";
import { todayYMD } from "@/src/shared/utils/format";
import {
  courseSessionQueries,
  deleteCourseSession,
  deleteCourseSessionBulk,
  type CourseSession,
} from "@/src/entities/course-session";
import { CourseSessionFormDialog } from "./course-session-form-dialog";
import { CourseSessionBulkEditDialog } from "./course-session-bulk-edit-dialog";
import { AttachTraineesDialog } from "./attach-trainees-dialog";

/** 헤더 전체 선택 체크박스 — 일부만 선택돼면 indeterminate */
function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      className="size-4 accent-[--color-accent] cursor-pointer"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      onChange={(e) => onChange(e.target.checked)}
      aria-label="전체 선택"
    />
  );
}

/** 교육 일정 관리 — 일정 등록 → 교육생 연결로 교육 이력 생성 */
export function CourseSessionListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const status = searchParams.get("status") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const limit = Math.max(1, Number(searchParams.get("limit") ?? 10) || 10);

  const [searchInput, setSearchInput] = useState(q);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CourseSession | null>(null);
  const [attachTarget, setAttachTarget] = useState<CourseSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CourseSession | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // 페이지·필터가 바뀌면 선택은 초기화 — 다른 페이지 행과 뒤섞이지 않는다
  useEffect(() => {
    setSelectedIds(new Set());
  }, [q, from, to, status, page]);

  const { data } = useQuery(
    courseSessionQueries.list({
      q: q || undefined,
      status: status === "" ? undefined : (status as "active" | "ended"),
      dateFrom: from || undefined,
      dateTo: to || undefined,
      page,
      limit,
    }),
  );

  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCourseSession(id),
    onSuccess: () => {
      toast.success("일정을 삭제했어요. 연결된 이력은 남아 있어요");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: courseSessionQueries.all() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => deleteCourseSessionBulk(ids),
    onSuccess: (deleted) => {
      toast.success(`${deleted}개 일정을 삭제했어요. 연결된 이력은 남아 있어요`);
      setBulkDeleteOpen(false);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: courseSessionQueries.all() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleRow = (s: CourseSession, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(s.id);
      else next.delete(s.id);
      return next;
    });
  };

  const updateParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete("page");
    setSearchParams(next, { replace: false });
  };

  const period = (s: CourseSession) => {
    if (!s.startedAt && !s.endedAt) return "—";
    return `${s.startedAt ?? "?"} ~ ${s.endedAt ?? "진행중"}`;
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const allPageSelected = items.length > 0 && items.every((s) => selectedIds.has(s.id));
  const somePageSelected = items.some((s) => selectedIds.has(s.id));

  const toggleAllPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const s of items) {
        if (checked) next.add(s.id);
        else next.delete(s.id);
      }
      return next;
    });
  };

  const selectedSessions = items.filter((s) => selectedIds.has(s.id));

  const columns = useMemo<ColumnDef<CourseSession, unknown>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <SelectAllCheckbox
            checked={allPageSelected}
            indeterminate={!allPageSelected && somePageSelected}
            onChange={toggleAllPage}
          />
        ),
        meta: { width: 44 },
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="size-4 accent-[--color-accent] cursor-pointer"
            checked={selectedIds.has(row.original.id)}
            onChange={(e) => toggleRow(row.original, e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`${row.original.courseName} 선택`}
          />
        ),
      },
      {
        accessorKey: "courseName",
        header: "과정명",
        meta: { width: 260 },
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="font-medium text-ink">{row.original.courseName}</span>
            <span className="text-[11px] text-ink-3">{row.original.institutionName}</span>
          </span>
        ),
      },
      {
        id: "period",
        header: "기간",
        meta: { width: 180 },
        cell: ({ row }) => period(row.original),
      },
      {
        id: "hours",
        header: "인정 시수",
        meta: { width: 90, align: "right" },
        cell: ({ row }) => row.original.recognizedHours ?? "—",
      },
      {
        id: "enrolled",
        header: "수강생",
        meta: { width: 90, align: "right" },
        cell: ({ row }) => row.original.enrolledCount.toLocaleString(),
      },
      {
        id: "status",
        header: "상태",
        meta: { width: 90 },
        cell: ({ row }) => {
          const s = row.original;
          const effectiveEnd = s.endedAt ?? s.startedAt;
          const ended = !s.isActive || (effectiveEnd !== null && effectiveEnd < todayYMD());
          return <Pill tone={ended ? "muted" : "ok"}>{ended ? "종료" : "운영중"}</Pill>;
        },
      },
      {
        id: "actions",
        header: "",
        meta: { width: 220, align: "right", sticky: "right" },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setAttachTarget(row.original);
              }}
            >
              <Users className="size-3.5" /> 감리원 연결
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
        ),
      },
    ],
    // 체크박스 컬럼이 현재 페이지 행·선택 상태를 닫아 둔다
    [items, selectedIds],
  );

  const selectedCount = selectedIds.size;

  return (
    <PageContainer>
      <PageHead
        title="교육 일정 관리"
        subtitle={`총 ${total.toLocaleString()}개의 개설 일정`}
        actions={
          <Button
            onClick={() => {
              setEditTarget(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> 일정 등록
          </Button>
        }
      />

      <FilterBar>
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
              placeholder="과정명 · 기관명"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Button type="submit" variant="secondary" size="sm">
              검색
            </Button>
          </form>
        </FilterRow>
        <FilterRow label="기간">
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              className="w-36"
              value={from}
              onChange={(e) => updateParams({ from: e.target.value || null })}
            />
            <span className="text-ink-3">~</span>
            <Input
              type="date"
              className="w-36"
              value={to}
              min={from || undefined}
              onChange={(e) => updateParams({ to: e.target.value || null })}
            />
          </div>
        </FilterRow>
        <FilterRow label="상태">
          <Select
            className="w-28"
            value={status}
            onChange={(e) => updateParams({ status: e.target.value || null })}
          >
            <option value="">전체</option>
            <option value="active">운영중</option>
            <option value="ended">종료</option>
          </Select>
        </FilterRow>
      </FilterBar>

      {selectedCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-line bg-panel px-4 py-2.5">
          <span className="text-[13px] text-ink-2">
            <span className="font-semibold text-ink">{selectedCount.toLocaleString()}개</span>{" "}
            일정이 선택됐어요
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>
              선택 해제
            </Button>
            <Button size="sm" onClick={() => setBulkEditOpen(true)}>
              <PencilLine className="size-3.5" /> 일괄 수정
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="size-3.5" /> 일괄 삭제
            </Button>
          </div>
        </div>
      )}

      <AppTable
        columns={columns}
        data={items}
        isLoading={!data}
        onRowClick={(s) => toggleRow(s, !selectedIds.has(s.id))}
        emptyMessage="등록된 교육 일정이 없어요. 일정을 등록하고 감리원을 연결해 보세요"
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) }, false)}
        limit={limit}
        onLimitChange={(n) => updateParams({ limit: String(n) })}
        paginationInfo={`총 ${total.toLocaleString()}건 · ${page}/${totalPages}페이지`}
        columnDividers
      />

      <CourseSessionFormDialog
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        session={editTarget}
        onCreated={(created) => setAttachTarget(created)}
      />
      <Dialog
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title="일괄 삭제"
        description={`선택한 ${selectedCount.toLocaleString()}개 일정을 삭제할까요? 연결된 교육 내역은 삭제되지 않고, 일정과의 연결만 끊겨요.`}
        actions={[
          { label: "취소", onClick: () => setBulkDeleteOpen(false) },
          {
            label: `${selectedCount.toLocaleString()}개 삭제`,
            variant: "danger",
            isLoading: bulkDeleteMutation.isPending,
            onClick: () => bulkDeleteMutation.mutate([...selectedIds]),
          },
        ]}
      />
      <AttachTraineesDialog
        isOpen={attachTarget !== null}
        onClose={() => setAttachTarget(null)}
        session={attachTarget}
      />
      <CourseSessionBulkEditDialog
        isOpen={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        sessions={selectedSessions}
        onDone={() => setSelectedIds(new Set())}
      />
      <Dialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="일정 삭제"
        description={
          deleteTarget
            ? `'${deleteTarget.courseName}' 일정을 삭제할까요? 연결된 교육 내역은 삭제되지 않아요.`
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
    </PageContainer>
  );
}
