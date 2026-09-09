import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { AppTable } from '@/src/shared/ui/app-table'
import { Dialog } from '@/src/shared/ui/dialog'
import { FilterBar, FilterRow } from '@/src/shared/ui/filter-bar'
import { Input } from '@/src/shared/ui/input'
import { PageContainer } from '@/src/shared/ui/page-container'
import { PageHead } from '@/src/shared/ui/page-head'
import { formatDateTime } from '@/src/shared/utils/format'
import { auditLogQueries, type AuditLog } from '@/src/entities/audit'

export function AuditLogListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const entityType = searchParams.get('entity') ?? ''
  const entityId = searchParams.get('id') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)

  const [detail, setDetail] = useState<AuditLog | null>(null)

  const { data } = useQuery(
    auditLogQueries.list({
      entityType: entityType || undefined,
      entityId: entityId || undefined,
      page,
    }),
  )

  const updateParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    if (resetPage) next.delete('page')
    setSearchParams(next, { replace: false })
  }

  const columns = useMemo<ColumnDef<AuditLog, unknown>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: '일시',
        meta: { width: 160 },
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        accessorKey: 'actorName',
        header: '관리자',
        meta: { width: 120 },
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.actorName}</span>,
      },
      {
        accessorKey: 'action',
        header: '액션',
        meta: { width: 140 },
        cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.action}</span>,
      },
      {
        accessorKey: 'entityType',
        header: '엔티티',
        meta: { width: 150 },
        cell: ({ row }) => (
          <span className="font-mono text-[12px]">
            {row.original.entityType} #{row.original.entityId}
          </span>
        ),
      },
      {
        id: 'changes',
        header: '변경 요약',
        meta: { width: 260 },
        cell: ({ row }) => {
          const afterKeys = row.original.after ? Object.keys(row.original.after) : []
          if (afterKeys.length === 0) return '—'
          return (
            <span className="text-ink-2" title={afterKeys.join(', ')}>
              {afterKeys.slice(0, 4).join(', ')}
              {afterKeys.length > 4 ? ` 외 ${afterKeys.length - 4}` : ''}
            </span>
          )
        },
      },
    ],
    [],
  )

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <PageContainer>
      <PageHead
        title="감사 로그"
        subtitle="관리자 화면에서 일어난 모든 변경의 기록 — 읽기 전용"
      />

      <FilterBar>
        <FilterRow label="필터">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const form = new FormData(e.currentTarget)
              updateParams({
                entity: String(form.get('entity') ?? ''),
                id: String(form.get('id') ?? ''),
              })
            }}
          >
            <Input
              name="entity"
              className="w-44"
              placeholder="엔티티 타입 (예: trainee)"
              defaultValue={entityType}
            />
            <Input
              name="id"
              type="number"
              className="w-28"
              placeholder="엔티티 ID"
              defaultValue={entityId}
            />
            <button
              type="submit"
              className="rounded-md border border-line px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-panel-2"
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
        paginationInfo={`총 ${total.toLocaleString()}건 · ${page}/${totalPages}페이지`}
        columnDividers
      />

      <Dialog
        isOpen={detail !== null}
        onClose={() => setDetail(null)}
        title="변경 상세"
        size="lg"
        actions={[{ label: '닫기', variant: 'primary', onClick: () => setDetail(null) }]}
      >
        {detail && (
          <div className="space-y-3 pt-1 text-[13px]">
            <div className="grid grid-cols-4 gap-3 rounded-lg border border-line bg-panel-2/40 p-3">
              <div>
                <p className="text-[11px] text-ink-3">일시</p>
                <p className="mt-0.5">{formatDateTime(detail.createdAt)}</p>
              </div>
              <div>
                <p className="text-[11px] text-ink-3">관리자</p>
                <p className="mt-0.5 font-medium text-ink">{detail.actorName}</p>
              </div>
              <div>
                <p className="text-[11px] text-ink-3">액션</p>
                <p className="mt-0.5 font-mono text-[12px]">{detail.action}</p>
              </div>
              <div>
                <p className="text-[11px] text-ink-3">엔티티</p>
                <p className="mt-0.5 font-mono text-[12px]">
                  {detail.entityType} #{detail.entityId}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-[11px] font-medium text-ink-3">변경 전 (before)</p>
                <pre className="max-h-72 overflow-auto scrollbar-thin rounded-lg border border-line bg-panel-2/40 p-3 font-mono text-[12px] leading-relaxed text-ink-2">
                  {detail.before ? JSON.stringify(detail.before, null, 2) : '—'}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-ink-3">변경 후 (after)</p>
                <pre className="max-h-72 overflow-auto scrollbar-thin rounded-lg border border-line bg-panel-2/40 p-3 font-mono text-[12px] leading-relaxed text-ink-2">
                  {detail.after ? JSON.stringify(detail.after, null, 2) : '—'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </PageContainer>
  )
}
