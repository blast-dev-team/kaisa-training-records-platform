import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { AppTable } from "@/src/shared/ui/app-table";
import { Button } from "@/src/shared/ui/button";
import { Dialog } from "@/src/shared/ui/dialog";
import { PageContainer } from "@/src/shared/ui/page-container";
import { PageHead } from "@/src/shared/ui/page-head";
import { Pill } from "@/src/shared/ui/pill";
import { toYMD } from "@/src/shared/utils/format";
import {
  deleteMembershipGrade,
  membershipGradeQueries,
  type MembershipGrade,
} from "@/src/entities/trainee";
import { GradeFormDialog } from "./grade-form-dialog";

const fmtKrw = (n: number) => `${n.toLocaleString()}원`;

export function MembershipGradeListPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MembershipGrade | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MembershipGrade | null>(null);
  const queryClient = useQueryClient();

  const { data: grades } = useQuery(membershipGradeQueries.list());

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMembershipGrade(id),
    onSuccess: () => {
      toast.success("등급을 삭제했어요 — 과거 발급 이력은 보존돼요");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: membershipGradeQueries.all() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = useMemo<ColumnDef<MembershipGrade, unknown>[]>(
    () => [
      {
        accessorKey: "sortOrder",
        header: "순서",
        meta: { width: 70, align: "right" },
      },
      {
        accessorKey: "name",
        header: "등급명",
        meta: { width: 160 },
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.name}</span>,
      },
      {
        accessorKey: "code",
        header: "코드",
        meta: { width: 120 },
        cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.code}</span>,
      },
      {
        accessorKey: "priceKrw",
        header: "발급 단가",
        meta: { width: 110, align: "right" },
        cell: ({ row }) => <span className="font-medium">{fmtKrw(row.original.priceKrw)}</span>,
      },
      {
        accessorKey: "description",
        header: "설명",
        meta: { width: 260 },
        cell: ({ row }) => (
          <span className="text-ink-2" title={row.original.description ?? ""}>
            {row.original.description ?? "—"}
          </span>
        ),
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
        accessorKey: "createdAt",
        header: "등록일",
        meta: { width: 120 },
        cell: ({ row }) => toYMD(row.original.createdAt) ?? "—",
      },
      {
        id: "actions",
        header: "",
        meta: { width: 130, align: "right", sticky: "right" },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
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
            {row.original.isActive && (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:text-danger"
                onClick={() => setDeleteTarget(row.original)}
              >
                삭제
              </Button>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <PageContainer>
      <PageHead
        title="회원등급 관리"
        subtitle="일반 · 연간 · 평생 등 감리원 등급 마스터"
        actions={
          <Button
            onClick={() => {
              setEditTarget(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> 등급 등록
          </Button>
        }
      />

      <AppTable
        columns={columns}
        data={grades ?? []}
        isLoading={!grades}
        emptyMessage="등록된 등급이 없어요. 첫 등급을 등록해 보세요"
      />

      <GradeFormDialog isOpen={formOpen} onClose={() => setFormOpen(false)} grade={editTarget} />

      <Dialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="등급 삭제"
        description={
          deleteTarget
            ? `'${deleteTarget.name}' 등급을 삭제할까요? 이 등급으로 발급된 과거 이력은 보존돼요. 배정된 감리원이 있으면 삭제할 수 없어요.`
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
