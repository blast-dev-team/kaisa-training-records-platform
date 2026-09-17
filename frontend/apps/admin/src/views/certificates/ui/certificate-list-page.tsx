import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import type { ColumnDef } from "@tanstack/react-table";
import { AppTable } from "@/src/shared/ui/app-table";
import { Button } from "@/src/shared/ui/button";
import { Dialog } from "@/src/shared/ui/dialog";
import { FilterBar, FilterRow } from "@/src/shared/ui/filter-bar";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import { PageContainer } from "@/src/shared/ui/page-container";
import { PageHead } from "@/src/shared/ui/page-head";
import { Pill, statusTone } from "@/src/shared/ui/pill";
import { Select } from "@/src/shared/ui/select";
import { Textarea } from "@/src/shared/ui/textarea";
import { formatDateTime, toYMD } from "@/src/shared/utils/format";
import {
  certificateQueries,
  CERTIFICATE_STATUS_LABELS,
  postRevokeCertificate,
  type Certificate,
} from "@/src/entities/certificate";

export function CertificateListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);

  const [searchInput, setSearchInput] = useState(q);

  const [revokeTarget, setRevokeTarget] = useState<Certificate | null>(null);
  const [reason, setReason] = useState("");

  const queryClient = useQueryClient();
  const { data } = useQuery(certificateQueries.list({ status, search: q || undefined, page }));

  const revokeMutation = useMutation({
    mutationFn: () => postRevokeCertificate(revokeTarget!.id, reason.trim()),
    onSuccess: () => {
      toast.success("확인서를 철회했어요");
      setRevokeTarget(null);
      queryClient.invalidateQueries({ queryKey: certificateQueries.all() });
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

  const columns = useMemo<ColumnDef<Certificate, unknown>[]>(
    () => [
      {
        accessorKey: "certificateNo",
        header: "증명서번호",
        meta: { width: 150 },
        cell: ({ row }) => (
          <span className="font-mono text-[12px] font-medium text-ink">
            {row.original.certificateNo}
          </span>
        ),
      },
      {
        accessorKey: "issuedName",
        header: "성명",
        meta: { width: 100 },
      },
      {
        accessorKey: "courseName",
        header: "과정",
        meta: { width: 220 },
        cell: ({ row }) => (
          <span className="text-ink" title={row.original.courseName}>
            {row.original.courseName}
          </span>
        ),
      },
      {
        accessorKey: "institutionName",
        header: "기관",
        meta: { width: 150 },
        cell: ({ row }) => row.original.institutionName ?? "—",
      },
      {
        id: "hours",
        header: "시수",
        meta: { width: 90, align: "right" },
        cell: ({ row }) => row.original.completedHours ?? row.original.totalHours ?? "—",
      },
      {
        id: "trainingPeriod",
        header: "교육기간",
        meta: { width: 180 },
        cell: ({ row }) => {
          const s = toYMD(row.original.trainingStartedAt);
          const e = toYMD(row.original.trainingEndedAt);
          if (!s && !e) return "—";
          return `${s ?? "?"} ~ ${e ?? "?"}`;
        },
      },
      {
        accessorKey: "issuedAt",
        header: "발급일시",
        meta: { width: 150 },
        cell: ({ row }) => (row.original.issuedAt ? formatDateTime(row.original.issuedAt) : "—"),
      },
      {
        accessorKey: "status",
        header: "상태",
        meta: { width: 100 },
        cell: ({ row }) => (
          <Pill tone={statusTone(row.original.status)}>
            {CERTIFICATE_STATUS_LABELS[row.original.status]}
          </Pill>
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
      <PageHead title="확인서 발급 내역" subtitle={`총 ${total.toLocaleString()}건`} />

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
              placeholder="확인서 번호 · 성명 · 과정명"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Button type="submit" variant="secondary" size="sm">
              검색
            </Button>
          </form>
        </FilterRow>
        <FilterRow label="필터">
          <Select
            className="w-36"
            value={status}
            onChange={(e) => updateParams({ status: e.target.value || null })}
          >
            <option value="">상태 전체</option>
            {Object.entries(CERTIFICATE_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FilterRow>
      </FilterBar>

      <AppTable
        columns={columns}
        data={items}
        isLoading={!data}
        emptyMessage="발급 내역이 없어요"
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) }, false)}
        paginationInfo={`총 ${total.toLocaleString()}건 · ${page}/${totalPages}페이지`}
        columnDividers
      />
    </PageContainer>
  );
}
