import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AppTable } from "@/src/shared/ui/app-table";
import { Button } from "@/src/shared/ui/button";
import { FilterBar, FilterRow } from "@/src/shared/ui/filter-bar";
import { SearchInput } from "@/src/shared/ui/search-input";
import { PageContainer } from "@/src/shared/ui/page-container";
import { PageHead } from "@/src/shared/ui/page-head";
import { Pill, statusTone } from "@/src/shared/ui/pill";
import { Select } from "@/src/shared/ui/select";
import { formatDateTime } from "@/src/shared/utils/format";
import {
  identityReviewQueries,
  REVIEW_STATUS_LABELS,
  type IdentityReview,
} from "@/src/entities/identity-review";
import { ReviewDialog } from "./review-dialog";

export function IdentityReviewListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // 상태 필터 — 기본 전체(status 키 없음). 과거 승인·거절 이력도 같은 목록에서 조회.
  const status = searchParams.get("status") ?? "";
  // 정렬 — URL 값 없으면 서버 기본(created_at desc = 기본순). UI 기본 표시는 빈 값.
  const sort = searchParams.get("sort") ?? "";
  const order = searchParams.get("order") ?? "desc";
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const limit = Math.max(1, Number(searchParams.get("limit") ?? 10) || 10);

  const [searchInput, setSearchInput] = useState(q);
  const [reviewTarget, setReviewTarget] = useState<IdentityReview | null>(null);

  const { data } = useQuery(
    identityReviewQueries.list({
      status: status || undefined,
      search: q || undefined,
      sort: sort || undefined,
      order: order || undefined,
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

  const columns = useMemo<ColumnDef<IdentityReview, unknown>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "신청일시",
        meta: { width: 150 },
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        accessorKey: "userName",
        header: "회원 계정명",
        meta: { width: 120 },
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.userName}</span>,
      },
      {
        accessorKey: "verifiedName",
        header: "인증 성명",
        meta: { width: 110 },
      },
      {
        accessorKey: "verifiedPhoneMasked",
        header: "인증 전화",
        meta: { width: 140 },
        cell: ({ row }) => (
          <span className="font-mono text-12">{row.original.verifiedPhoneMasked}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "상태",
        meta: { width: 100 },
        cell: ({ row }) => (
          <Pill tone={statusTone(row.original.status)}>
            {REVIEW_STATUS_LABELS[row.original.status]}
          </Pill>
        ),
      },
      {
        accessorKey: "reviewedAt",
        header: "처리일시",
        meta: { width: 150 },
        cell: ({ row }) =>
          row.original.reviewedAt ? formatDateTime(row.original.reviewedAt) : "—",
      },
      {
        accessorKey: "reviewNote",
        header: "메모",
        meta: { width: 200 },
        cell: ({ row }) => (
          <span className="text-ink-2" title={row.original.reviewNote ?? ""}>
            {row.original.reviewNote ?? "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        meta: { width: 100, align: "right" },
        cell: ({ row }) =>
          row.original.status === "manual_review" || row.original.status === "pending" ? (
            <Button variant="outline" size="sm" onClick={() => setReviewTarget(row.original)}>
              심사
            </Button>
          ) : null,
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
        title="본인인증 심사"
        subtitle="자동 매칭 실패 건 — 성명 검색 + 전화번호(마스킹) 대조로 감리원을 연결해요"
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
            <SearchInput
              className="w-64"
              placeholder="계정명 · 인증 성명(전체)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onClear={() => updateParams({ q: null })}
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
            {/* pending은 service가 절대 생성하지 않는 죽은 상태 — 옵션에서 제외 */}
            <option value="">전체</option>
            <option value="manual_review">{REVIEW_STATUS_LABELS.manual_review}</option>
            <option value="approved">{REVIEW_STATUS_LABELS.approved}</option>
            <option value="rejected">{REVIEW_STATUS_LABELS.rejected}</option>
          </Select>
        </FilterRow>
        <FilterRow label="정렬">
          <Select
            className="w-36"
            value={sort === "created_at" || sort === "reviewed_at" ? `${sort}:${order}` : ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                updateParams({ sort: null, order: null });
                return;
              }
              const [s = "", o = ""] = v.split(":");
              updateParams({ sort: s, order: o });
            }}
          >
            <option value="">기본순</option>
            <option value="created_at:desc">신청일시 최신순</option>
            <option value="created_at:asc">신청일시 오래된순</option>
            <option value="reviewed_at:desc">처리일시 최신순</option>
            <option value="reviewed_at:asc">처리일시 오래된순</option>
          </Select>
        </FilterRow>
      </FilterBar>

      <AppTable
        columns={columns}
        data={items}
        isLoading={!data}
        emptyMessage="해당 상태의 심사 건이 없어요"
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) }, false)}
        limit={limit}
        onLimitChange={(n) => updateParams({ limit: String(n) })}
        paginationInfo={`총 ${total.toLocaleString()}건 · ${page}/${totalPages}페이지`}
        columnDividers
      />

      <ReviewDialog review={reviewTarget} onClose={() => setReviewTarget(null)} />
    </PageContainer>
  );
}
