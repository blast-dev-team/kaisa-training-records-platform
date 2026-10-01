import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AppTable } from "@/src/shared/ui/app-table";
import { Dialog } from "@/src/shared/ui/dialog";
import { FilterBar, FilterRow } from "@/src/shared/ui/filter-bar";
import { SearchInput } from "@/src/shared/ui/search-input";
import { PageContainer } from "@/src/shared/ui/page-container";
import { PageHead } from "@/src/shared/ui/page-head";
import { Select } from "@/src/shared/ui/select";
import { formatDateTime } from "@/src/shared/utils/format";
import {
  auditLogQueries,
  ENTITY_TYPE_LABELS,
  formatActionLabel,
  formatEntityTypeLabel,
  formatFieldLabel,
  formatFieldValue,
  type AuditLog,
} from "@/src/entities/audit";

export function AuditLogListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const entityType = searchParams.get("entity") ?? "";
  const entityId = searchParams.get("id") ?? "";
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const limit = Math.max(1, Number(searchParams.get("limit") ?? 10) || 10);

  const [detail, setDetail] = useState<AuditLog | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const { data } = useQuery(
    auditLogQueries.list({
      entityType: entityType || undefined,
      entityId: entityId || undefined,
      q: q || undefined,
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

  const columns = useMemo<ColumnDef<AuditLog, unknown>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "일시",
        meta: { width: 160 },
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        accessorKey: "actorName",
        header: "관리자",
        meta: { width: 120 },
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.actorName}</span>,
      },
      {
        accessorKey: "action",
        header: "액션",
        meta: { width: 160 },
        cell: ({ row }) => (
          <span className="font-medium text-ink" title={row.original.action}>
            {formatActionLabel(row.original.action)}
          </span>
        ),
      },
      {
        accessorKey: "entityType",
        header: "엔티티",
        meta: { width: 150 },
        cell: ({ row }) => (
          <span className="text-12 text-ink-2">
            {formatEntityTypeLabel(row.original.entityType)}
            <span className="ml-1 font-mono text-11 text-ink-3">#{row.original.entityId}</span>
          </span>
        ),
      },
      {
        id: "changes",
        header: "변경 요약",
        meta: { width: 260 },
        cell: ({ row }) => {
          const keys = row.original.after
            ? Object.keys(row.original.after)
            : row.original.before
              ? Object.keys(row.original.before)
              : [];
          if (keys.length === 0) return "—";
          const labels = keys.map(formatFieldLabel);
          const preview = labels.slice(0, 3).join(", ");
          return (
            <span className="text-ink-2" title={labels.join(", ")}>
              {preview}
              {labels.length > 3 ? ` 외 ${labels.length - 3}개` : " 변경"}
            </span>
          );
        },
      },
    ],
    [],
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <PageContainer>
      <PageHead title="감사 로그" subtitle="관리자 화면에서 일어난 모든 변경의 기록 — 읽기 전용" />

      <FilterBar>
        <FilterRow label="필터">
          <form
            ref={formRef}
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              // 엔티티 타입은 Select 가 onChange 로 직접 URL 에 반영 — 여기선 검색어·ID 만
              const form = new FormData(e.currentTarget);
              updateParams({
                id: String(form.get("id") ?? ""),
                q: String(form.get("q") ?? ""),
              });
            }}
          >
            <SearchInput
              name="q"
              className="w-56"
              placeholder="액션·관리자·생성/변경 내용 검색"
              defaultValue={q}
              onClear={() => formRef.current?.requestSubmit()}
            />
            <div className="relative w-44">
              <Select
                className="w-full"
                name="entity"
                value={entityType}
                onChange={(e) => updateParams({ entity: e.target.value || null })}
              >
                <option value="">엔티티 전체</option>
                {Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              {entityType && (
                <button
                  type="button"
                  aria-label="엔티티 필터 지우기"
                  className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
                  onClick={() => updateParams({ entity: null })}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <SearchInput
              name="id"
              className="w-56"
              placeholder="엔티티 ID (UUID)"
              defaultValue={entityId}
              onClear={() => formRef.current?.requestSubmit()}
            />
            <button
              type="submit"
              className="rounded-md border border-line px-3 py-1.5 text-13 font-medium text-ink-2 hover:bg-panel-2"
            >
              조회
            </button>
          </form>
        </FilterRow>
      </FilterBar>

      <AppTable
        columns={columns}
        data={items}
        isLoading={!data}
        emptyMessage="감사 로그가 없어요"
        onRowClick={setDetail}
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) }, false)}
        limit={limit}
        onLimitChange={(n) => updateParams({ limit: String(n) })}
        paginationInfo={`총 ${total.toLocaleString()}건 · ${page}/${totalPages}페이지`}
        columnDividers
      />

      <Dialog
        isOpen={detail !== null}
        onClose={() => setDetail(null)}
        title="변경 상세"
        description={
          detail
            ? `${formatActionLabel(detail.action)} · ${formatEntityTypeLabel(detail.entityType)}`
            : undefined
        }
        size="xl"
        actions={[{ label: "닫기", variant: "primary", onClick: () => setDetail(null) }]}
      >
        {detail && (
          <div className="space-y-4 pt-1 text-13">
            <div className="flex flex-col gap-3 rounded-lg border border-line bg-panel-2/40 p-3">
              <div>
                <p className="text-11 text-ink-3">일시</p>
                <p className="mt-0.5">{formatDateTime(detail.createdAt)}</p>
              </div>
              <div>
                <p className="text-11 text-ink-3">관리자</p>
                <p className="mt-0.5 font-medium text-ink">{detail.actorName}</p>
              </div>
              <div>
                <p className="text-11 text-ink-3">액션</p>
                <p className="mt-0.5 font-medium text-ink">
                  {formatActionLabel(detail.action)}
                  <span className="ml-1 font-mono text-11 text-ink-3">{detail.action}</span>
                </p>
              </div>
              <div>
                <p className="text-11 text-ink-3">엔티티</p>
                <p className="mt-0.5 text-12 text-ink-2">
                  {formatEntityTypeLabel(detail.entityType)}
                  <span className="ml-1 font-mono text-11 text-ink-3">#{detail.entityId}</span>
                </p>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-12 font-medium text-ink">생성·변경 내용</p>
              <div className="max-h-[440px] overflow-y-auto scrollbar-thin rounded-lg border border-line">
                {(() => {
                  const keys = Array.from(
                    new Set([
                      ...Object.keys(detail.before ?? {}),
                      ...Object.keys(detail.after ?? {}),
                    ]),
                  );
                  if (keys.length === 0)
                    return <p className="p-4 text-ink-3">변경 기록이 없어요</p>;
                  return keys.map((key) => {
                    const hasBefore = detail.before !== null && key in detail.before;
                    const hasAfter = detail.after !== null && key in detail.after;
                    return (
                      <div
                        key={key}
                        className="flex flex-col items-start gap-2 border-b border-line/60 px-3 py-2.5 last:border-b-0 odd:bg-panel-2/30"
                      >
                        <span className="pt-0.5 text-12 text-ink-3">
                          {formatFieldLabel(key)}
                          <span className="mt-0.5 block font-mono text-10 text-ink-3/80">
                            {key}
                          </span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="whitespace-pre-wrap break-all text-12 text-ink-2">
                            {hasBefore ? formatFieldValue(detail.before?.[key]) : "—"}
                          </span>
                          <span className="pt-0.5 text-12 text-ink-3">→</span>
                          <span className="whitespace-pre-wrap break-all font-medium text-ink">
                            {hasAfter ? formatFieldValue(detail.after?.[key]) : "—"}
                          </span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </PageContainer>
  );
}
