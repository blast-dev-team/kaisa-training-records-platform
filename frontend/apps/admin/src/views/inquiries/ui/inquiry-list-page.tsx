import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AppTable } from "@/src/shared/ui/app-table";
import { Button } from "@/src/shared/ui/button";
import { DateField } from "@/src/shared/ui/date-picker/date-field";
import { FilterBar, FilterRow } from "@/src/shared/ui/filter-bar";
import { PageContainer } from "@/src/shared/ui/page-container";
import { PageHead } from "@/src/shared/ui/page-head";
import { Pill } from "@/src/shared/ui/pill";
import { SearchInput } from "@/src/shared/ui/search-input";
import { Select } from "@/src/shared/ui/select";
import { adjustDateRange } from "@/src/shared/utils/date-range";
import { formatDateTime } from "@/src/shared/utils/format";
import {
  INQUIRY_CATEGORY_LABELS,
  INQUIRY_STATUS_LABELS,
  inquiryCategoryLabel,
  inquiryQueries,
  type InquiryListItem,
} from "@/src/entities/inquiry";
import { InquiryDetailDialog } from "./inquiry-detail-dialog";

/**
 * 문의함 — 운영 > 문의함.
 * 상태 기본값은 미해결(URL `status` 없음). 전체는 `status=all`, 답변완료는 `status=answered`.
 */
export function InquiryListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status") ?? "";
  const status = statusParam === "all" ? "" : statusParam === "answered" ? "answered" : "open";
  const category = searchParams.get("category") ?? "";
  const author = searchParams.get("author") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const limit = Math.max(1, Number(searchParams.get("limit") ?? 20) || 20);

  const [searchInput, setSearchInput] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data } = useQuery(
    inquiryQueries.list({
      status: status || undefined,
      category: category || undefined,
      authorType: author || undefined,
      search: q || undefined,
      dateFrom: from || undefined,
      dateTo: to || undefined,
      page,
      limit,
    }),
  );

  const updateParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete("page");
    setSearchParams(next, { replace: false });
  };

  const columns = useMemo<ColumnDef<InquiryListItem, unknown>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "접수일시",
        meta: { width: 150 },
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        accessorKey: "category",
        header: "유형",
        meta: { width: 150 },
        cell: ({ row }) => inquiryCategoryLabel(row.original.category),
      },
      {
        accessorKey: "title",
        header: "제목",
        meta: { width: 280 },
        cell: ({ row }) => (
          <span className="font-medium text-ink" title={row.original.title}>
            {row.original.title}
          </span>
        ),
      },
      {
        accessorKey: "authorName",
        header: "문의자",
        meta: { width: 150 },
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5">
            {row.original.authorName}
            <Pill tone={row.original.isMember ? "accent" : "default"}>
              {row.original.isMember ? "회원" : "비회원"}
            </Pill>
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "상태",
        meta: { width: 100 },
        cell: ({ row }) => (
          <Pill tone={row.original.status === "answered" ? "ok" : "warn"}>
            {INQUIRY_STATUS_LABELS[row.original.status]}
          </Pill>
        ),
      },
      {
        accessorKey: "answeredAt",
        header: "답변",
        meta: { width: 170 },
        cell: ({ row }) =>
          row.original.answeredAt
            ? `${row.original.answeredByName ?? "-"} · ${formatDateTime(row.original.answeredAt)}`
            : "—",
      },
    ],
    [],
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <PageContainer>
      <PageHead title="문의함" subtitle="교육생(회원·비회원)이 남긴 문의에 답변해요" />

      <FilterBar>
        <FilterRow label="검색">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              updateParams({ q: searchInput.trim() || null });
            }}
          >
            <SearchInput
              className="w-64"
              placeholder="제목 · 문의자 성명(전체)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onClear={() => {
                setSearchInput("");
                updateParams({ q: null });
              }}
            />
            <Button type="submit" variant="secondary" size="sm">
              검색
            </Button>
          </form>
        </FilterRow>
        <FilterRow label="필터">
          <Select
            className="w-32"
            value={statusParam === "all" || statusParam === "answered" ? statusParam : ""}
            onChange={(e) => updateParams({ status: e.target.value || null })}
          >
            <option value="">{INQUIRY_STATUS_LABELS.open}</option>
            <option value="answered">{INQUIRY_STATUS_LABELS.answered}</option>
            <option value="all">전체 상태</option>
          </Select>
          <Select
            className="w-44"
            value={category}
            onChange={(e) => updateParams({ category: e.target.value || null })}
          >
            <option value="">전체 유형</option>
            {Object.entries(INQUIRY_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            className="w-32"
            value={author}
            onChange={(e) => updateParams({ author: e.target.value || null })}
          >
            <option value="">회원·비회원</option>
            <option value="member">회원</option>
            <option value="guest">비회원</option>
          </Select>
        </FilterRow>
        <FilterRow label="접수 기간">
          <div className="flex items-center gap-2">
            <DateField
              ariaLabel="접수 시작일"
              className="w-36"
              value={from}
              onChange={(v) => {
                const r = adjustDateRange({ from, to }, "from", v);
                updateParams({ from: r.from || null, to: r.to || null });
              }}
            />
            <span className="text-ink-3">~</span>
            <DateField
              ariaLabel="접수 종료일"
              className="w-36"
              value={to}
              onChange={(v) => {
                const r = adjustDateRange({ from, to }, "to", v);
                updateParams({ from: r.from || null, to: r.to || null });
              }}
            />
          </div>
        </FilterRow>
      </FilterBar>

      <AppTable
        columns={columns}
        data={items}
        isLoading={!data}
        emptyMessage={
          status === "open" && !q && !category && !author && !from && !to
            ? "미해결 문의가 없어요"
            : "조건에 맞는 문의가 없어요. 필터를 바꿔볼까요?"
        }
        onRowClick={(row) => setSelectedId(row.id)}
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) }, false)}
        limit={limit}
        onLimitChange={(n) => updateParams({ limit: String(n) })}
        paginationInfo={`총 ${total.toLocaleString()}건 · ${page}/${totalPages}페이지`}
        columnDividers
      />

      <InquiryDetailDialog inquiryId={selectedId} onClose={() => setSelectedId(null)} />
    </PageContainer>
  );
}
