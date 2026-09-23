import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import type { ColumnDef } from "@tanstack/react-table";
import { AppTable } from "@/src/shared/ui/app-table";
import { Button } from "@/src/shared/ui/button";
import { Dialog } from "@/src/shared/ui/dialog";
import { FilterBar, FilterRow } from "@/src/shared/ui/filter-bar";
import { Input } from "@/src/shared/ui/input";
import { PageHead } from "@/src/shared/ui/page-head";
import { PageContainer } from "@/src/shared/ui/page-container";
import { Pill, statusTone } from "@/src/shared/ui/pill";
import { Select } from "@/src/shared/ui/select";
import { toYMD } from "@/src/shared/utils/format";
import { Check, FileSpreadsheet, Minus, Plus } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import {
  deleteTrainee,
  membershipGradeQueries,
  traineeQueries,
  TRAINEE_REVIEW_STATUS_LABELS,
  type Trainee,
} from "@/src/entities/trainee";
import { BulkEditDialog } from "./bulk-edit-dialog";
import { BulkGradeDialog } from "./bulk-grade-dialog";
import { GradeChangeDialog } from "./grade-change-dialog";
import { TraineeFormDialog } from "./trainee-form-dialog";
import { TraineeDuplicatesDialog } from "./trainee-duplicates-dialog";
import { TraineeImportDialog } from "./trainee-import-dialog";

export function TraineeListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const q = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "";
  const gradeId = searchParams.get("grade") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const limit = Math.max(1, Number(searchParams.get("limit") ?? 10) || 10);

  const [searchInput, setSearchInput] = useState(q);
  const [gradeTarget, setGradeTarget] = useState<Trainee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Trainee | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Trainee | null>(null);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [bulkGradeOpen, setBulkGradeOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  /** id → Trainee — 페이지를 넘어 선택해도 일괄 모달에서 프리필할 수 있게 객체를 저장 */
  const [selected, setSelected] = useState<Record<string, Trainee>>({});

  const { data } = useQuery(traineeQueries.list({ q, reviewStatus: status, gradeId, page, limit }));
  const { data: grades } = useQuery(membershipGradeQueries.list(true));

  // 검색·필터가 바뀌면 행 집합의 의미가 달라진다 — 안 보이는 교육생이 남지 않게 선택 해제
  useEffect(() => {
    setSelected({});
  }, [q, status, gradeId]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTrainee(id),
    onSuccess: () => {
      toast.success("감리원을 삭제했어요 — 이력·확인서는 보존돼요");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: traineeQueries.all() });
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

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const toggleRow = (t: Trainee) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (t.id in next) delete next[t.id];
      else next[t.id] = t;
      return next;
    });
  };

  const toggleAllPage = useCallback(() => {
    setSelected((prev) => {
      const next = { ...prev };
      const allSelected = items.length > 0 && items.every((t) => t.id in next);
      for (const t of items) {
        if (allSelected) delete next[t.id];
        else next[t.id] = t;
      }
      return next;
    });
  }, [items]);

  const selectedCount = Object.keys(selected).length;
  const pageSelectedCount = items.filter((t) => t.id in selected).length;
  const allPageSelected = items.length > 0 && pageSelectedCount === items.length;

  const columns = useMemo<ColumnDef<Trainee, unknown>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <RowCheckbox
            checked={allPageSelected}
            indeterminate={pageSelectedCount > 0 && !allPageSelected}
            onChange={toggleAllPage}
          />
        ),
        meta: { width: 44 },
        cell: ({ row }) => (
          <span onClick={(e) => e.stopPropagation()}>
            <RowCheckbox
              checked={row.original.id in selected}
              onChange={() => toggleRow(row.original)}
            />
          </span>
        ),
      },
      { accessorKey: "name", header: "성명", meta: { width: 100 } },
      {
        accessorKey: "birthDate",
        header: "생년월일",
        meta: { width: 110 },
        cell: ({ row }) => row.original.birthDate ?? "—",
      },
      {
        accessorKey: "supervisorGrade",
        header: "감리원 등급",
        meta: { width: 100 },
        cell: ({ row }) => row.original.supervisorGrade ?? "—",
      },
      {
        accessorKey: "certNo",
        header: "감리원증번호",
        meta: { width: 180 },
        cell: ({ row }) => (
          <span className="block max-w-[180px] truncate" title={row.original.certNo ?? ""}>
            {row.original.certNo ?? "—"}
          </span>
        ),
      },
      { accessorKey: "phoneMasked", header: "전화", meta: { width: 130 } },
      {
        accessorKey: "email",
        header: "이메일",
        meta: { width: 200 },
        cell: ({ row }) => <span className="text-ink-2">{row.original.email ?? "—"}</span>,
      },
      {
        accessorKey: "gradeName",
        header: "회원등급",
        meta: { width: 150 },
        cell: ({ row }) =>
          row.original.gradeExpiresAt ? (
            <span>
              {row.original.gradeName ?? "—"}{" "}
              <span className="text-ink-3">· ~{row.original.gradeExpiresAt}</span>
            </span>
          ) : (
            (row.original.gradeName ?? "—")
          ),
      },
      {
        accessorKey: "reviewStatus",
        header: "인증상태",
        meta: { width: 100 },
        cell: ({ row }) => (
          <Pill tone={statusTone(row.original.reviewStatus)}>
            {TRAINEE_REVIEW_STATUS_LABELS[row.original.reviewStatus]}
          </Pill>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "등록일",
        meta: { width: 110 },
        cell: ({ row }) => toYMD(row.original.createdAt) ?? "—",
      },
      {
        id: "actions",
        header: "",
        meta: { width: 230, align: "right", sticky: "right" },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="outline"
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
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setGradeTarget(row.original);
              }}
            >
              등급변경
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link
                to={`/training-records?trainee_id=${row.original.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                이력
              </Link>
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
    // selected 를 닫아야 체크 상태가 갱신된다
    [selected, allPageSelected, pageSelectedCount, toggleAllPage],
  );

  return (
    <PageContainer>
      <PageHead
        title="감리원 관리"
        subtitle={`총 ${total.toLocaleString()}명`}
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="size-4" /> 엑셀 등록
            </Button>
            <Button
              onClick={() => {
                setEditTarget(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" /> 감리원 등록
            </Button>
          </>
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
              placeholder="성명(전체) · 감리원증번호"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Button type="submit" variant="secondary" size="sm">
              검색
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDuplicatesOpen(true)}
            >
              <AlertTriangle className="size-3.5" /> 중복확인
            </Button>
          </form>
        </FilterRow>
        <FilterRow label="필터">
          <Select
            className="w-36"
            value={status}
            onChange={(e) => updateParams({ status: e.target.value || null })}
          >
            <option value="">인증상태 전체</option>
            {Object.entries(TRAINEE_REVIEW_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            className="w-36"
            value={gradeId}
            onChange={(e) => updateParams({ grade: e.target.value || null })}
          >
            <option value="">등급 전체</option>
            {(grades ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </FilterRow>
      </FilterBar>

      {selectedCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-2.5">
          <span className="text-[13px] font-medium text-ink">선택 {selectedCount}명</span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected({})}>
              선택 해제
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkEditOpen(true)}>
              정보 수정
            </Button>
            <Button size="sm" onClick={() => setBulkGradeOpen(true)}>
              등급 변경
            </Button>
          </div>
        </div>
      )}

      <AppTable
        columns={columns}
        data={items}
        isLoading={!data}
        onRowClick={toggleRow}
        emptyMessage="조건에 맞는 감리원이 없어요"
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) }, false)}
        limit={limit}
        onLimitChange={(n) => updateParams({ limit: String(n) })}
        paginationInfo={`총 ${total.toLocaleString()}명 · ${page}/${totalPages}페이지`}
        columnDividers
      />

      <GradeChangeDialog trainee={gradeTarget} onClose={() => setGradeTarget(null)} />

      <TraineeFormDialog
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        trainee={editTarget}
      />

      <TraineeDuplicatesDialog
        isOpen={duplicatesOpen}
        onClose={() => setDuplicatesOpen(false)}
        onEdit={(t) => {
          setDuplicatesOpen(false);
          setEditTarget(t);
          setFormOpen(true);
        }}
      />

      <BulkGradeDialog
        isOpen={bulkGradeOpen}
        onClose={() => setBulkGradeOpen(false)}
        trainees={Object.values(selected)}
        onDone={() => setSelected({})}
      />

      <BulkEditDialog
        isOpen={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        trainees={Object.values(selected)}
        onDone={() => setSelected({})}
      />

      <TraineeImportDialog isOpen={importOpen} onClose={() => setImportOpen(false)} />

      <Dialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="감리원 삭제"
        description={
          deleteTarget
            ? `'${deleteTarget.name}' 감리원을 삭제할까요? 발급 이력·확인서·결제 기록은 보존되고, 목록과 회원 서비스에서만 사라져요. 진행 중인 신청·결제가 있으면 삭제할 수 없어요.`
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

/** 커스텀 체크박스 — sr-only input + 스타일 span (attach-trainees-dialog 와 같은 패턴) */
function RowCheckbox({
  checked,
  indeterminate = false,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  const shown = checked || indeterminate;
  return (
    <label className="flex cursor-pointer items-center justify-center cursor-pointer">
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      <span
        className={`flex size-4 shrink-0 items-center justify-center rounded border ${
          shown ? "border-accent bg-accent" : "border-line"
        }`}
      >
        {checked && !indeterminate && <Check className="size-3 text-white" />}
        {indeterminate && <Minus className="size-3 text-white" />}
      </span>
    </label>
  );
}
