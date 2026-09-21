import { useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Plus } from "lucide-react";
import { AppTable } from "@/src/shared/ui/app-table";
import { Button } from "@/src/shared/ui/button";
import { Dialog } from "@/src/shared/ui/dialog";
import { FilterBar, FilterRow } from "@/src/shared/ui/filter-bar";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import { PageContainer } from "@/src/shared/ui/page-container";
import { PageHead } from "@/src/shared/ui/page-head";
import { Pill } from "@/src/shared/ui/pill";
import { Select } from "@/src/shared/ui/select";
import {
  deleteSessionName,
  patchSessionName,
  postSessionName,
  sessionNameQueries,
} from "@/src/entities/institution";

interface EditState {
  id: string | null; // null = 신규
  name: string;
}

/** 회차명 관리 — 과정 등록에서 선택하는 회차명 마스터 CRUD */
export function SessionNameListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const limit = Math.max(1, Number(searchParams.get("limit") ?? 10) || 10);
  const [searchInput, setSearchInput] = useState(q);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data } = useQuery(
    sessionNameQueries.list({
      q: q || undefined,
      isActive: status === "" ? undefined : status === "active",
      page,
      limit,
    }),
  );
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: sessionNameQueries.all() });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!edit) return;
      if (edit.id) await patchSessionName(edit.id, { name: edit.name.trim() });
      else await postSessionName({ name: edit.name.trim() });
    },
    onSuccess: () => {
      toast.success(edit?.id ? "회차명을 수정했어요" : "회차명을 등록했어요");
      setEdit(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSessionName(id),
    onSuccess: () => {
      toast.success("회차명을 삭제했어요");
      setDeleteTarget(null);
      invalidate();
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

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <PageContainer>
      <PageHead
        title="회차명 관리"
        subtitle={`총 ${total.toLocaleString()}개의 회차명 — 과정 등록에서 선택해요`}
        actions={
          <Button onClick={() => setEdit({ id: null, name: "" })}>
            <Plus className="size-4" /> 회차명 등록
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
              placeholder="회차명"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Button type="submit" variant="secondary" size="sm">
              검색
            </Button>
          </form>
        </FilterRow>
        <FilterRow label="상태">
          <Select
            className="w-28"
            value={status}
            onChange={(e) => updateParams({ status: e.target.value || null })}
          >
            <option value="">전체</option>
            <option value="active">사용중</option>
            <option value="inactive">비활성</option>
          </Select>
        </FilterRow>
      </FilterBar>

      <AppTable
        columns={[
          {
            accessorKey: "name",
            header: "회차명",
            cell: ({ row }) => <span className="font-medium text-ink">{row.original.name}</span>,
          },
          {
            accessorKey: "isActive",
            header: "상태",
            meta: { width: 110 },
            cell: ({ row }) => (
              <Pill tone={row.original.isActive ? "ok" : "default"}>
                {row.original.isActive ? "사용중" : "비활성"}
              </Pill>
            ),
          },
          {
            id: "actions",
            header: "",
            meta: { width: 150, align: "right", sticky: "right" },
            cell: ({ row }) => (
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEdit({ id: row.original.id, name: row.original.name })}
                >
                  수정
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:text-danger"
                  onClick={() => setDeleteTarget({ id: row.original.id, name: row.original.name })}
                >
                  삭제
                </Button>
              </div>
            ),
          },
        ]}
        data={items}
        isLoading={!data}
        emptyMessage="등록된 회차명이 없어요. 첫 회차명을 등록해 보세요"
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) }, false)}
        limit={limit}
        onLimitChange={(n) => updateParams({ limit: String(n) })}
        paginationInfo={`총 ${total.toLocaleString()}건 · ${page}/${totalPages}페이지`}
        columnDividers
      />

      <Dialog
        isOpen={edit !== null}
        onClose={() => setEdit(null)}
        title={edit?.id ? "회차명 수정" : "회차명 등록"}
        actions={[
          { label: "취소", onClick: () => setEdit(null) },
          {
            label: edit?.id ? "수정" : "등록",
            isLoading: saveMutation.isPending,
            isDisabled: !edit?.name.trim(),
            onClick: () => saveMutation.mutate(),
          },
        ]}
      >
        <div className="space-y-1.5">
          <Label>회차명</Label>
          <Input
            placeholder="예: 2019년 1차"
            value={edit?.name ?? ""}
            onChange={(e) => setEdit((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
          />
        </div>
      </Dialog>

      <Dialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="회차명 삭제"
        description={
          deleteTarget
            ? `'${deleteTarget.name}' 을 삭제할까요? 참조 중인 과정의 회차명은 비워져요.`
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
