import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Users } from "lucide-react";
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
  type CourseSession,
} from "@/src/entities/course-session";
import { CourseSessionFormDialog } from "./course-session-form-dialog";
import { AttachTraineesDialog } from "./attach-trainees-dialog";

/** 교육 일정 관리 — 일정 등록 → 교육생 연결로 교육 이력 생성 */
export function CourseSessionListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const status = searchParams.get("status") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);

  const [searchInput, setSearchInput] = useState(q);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CourseSession | null>(null);
  const [attachTarget, setAttachTarget] = useState<CourseSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CourseSession | null>(null);

  const { data } = useQuery(
    courseSessionQueries.list({
      q: q || undefined,
      status: status === "" ? undefined : (status as "active" | "ended"),
      dateFrom: from || undefined,
      dateTo: to || undefined,
      page,
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

  const columns = useMemo<ColumnDef<CourseSession, unknown>[]>(
    () => [
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
          const ended =
            !s.isActive || (effectiveEnd !== null && effectiveEnd < todayYMD());
          return (
            <Pill tone={ended ? "muted" : "ok"}>{ended ? "종료" : "운영중"}</Pill>
          );
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
              onClick={() => setAttachTarget(row.original)}
            >
              <Users className="size-3.5" /> 교육생 연결
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
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
              onClick={() => setDeleteTarget(row.original)}
            >
              삭제
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

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

      <AppTable
        columns={columns}
        data={items}
        isLoading={!data}
        emptyMessage="등록된 교육 일정이 없어요. 일정을 등록하고 교육생을 연결해 보세요"
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) }, false)}
        paginationInfo={`총 ${total.toLocaleString()}건 · ${page}/${totalPages}페이지`}
        columnDividers
      />

      <CourseSessionFormDialog
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        session={editTarget}
        onCreated={(created) => setAttachTarget(created)}
      />
      <AttachTraineesDialog
        isOpen={attachTarget !== null}
        onClose={() => setAttachTarget(null)}
        session={attachTarget}
      />
      <Dialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="일정 삭제"
        description={
          deleteTarget
            ? `'${deleteTarget.courseName}' 일정을 삭제할까요? 연결된 교육 이력은 삭제되지 않아요.`
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
