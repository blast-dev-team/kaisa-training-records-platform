import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { AppTable } from '@/src/shared/ui/app-table'
import { Button } from '@/src/shared/ui/button'
import { FilterBar, FilterRow } from '@/src/shared/ui/filter-bar'
import { PageContainer } from '@/src/shared/ui/page-container'
import { PageHead } from '@/src/shared/ui/page-head'
import { Pill, statusTone } from '@/src/shared/ui/pill'
import { Select } from '@/src/shared/ui/select'
import { formatDateTime } from '@/src/shared/utils/format'
import {
  identityReviewQueries,
  REVIEW_STATUS_LABELS,
  type IdentityReview,
} from '@/src/entities/identity-review'
import { ReviewDialog } from './review-dialog'

/** 수동심사 필요 건이 가장 많이 보여야 하므로 기본 필터 */
const DEFAULT_STATUS = 'manual_review'

export function IdentityReviewListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get('status') ?? DEFAULT_STATUS
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)
  const [reviewTarget, setReviewTarget] = useState<IdentityReview | null>(null)

  // 기본 필터 1회 주입 — 공유 링크 재현성 (url-state.md 패턴)
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (!searchParams.has('status')) {
      const next = new URLSearchParams(searchParams)
      next.set('status', DEFAULT_STATUS)
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data } = useQuery(identityReviewQueries.list({ status, page }))

  const updateParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    if (resetPage) next.delete('page')
    setSearchParams(next, { replace: false })
  }

  const columns = useMemo<ColumnDef<IdentityReview, unknown>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: '신청일시',
        meta: { width: 150 },
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        accessorKey: 'userName',
        header: '회원 계정명',
        meta: { width: 120 },
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.userName}</span>,
      },
      {
        accessorKey: 'verifiedName',
        header: '인증 성명',
        meta: { width: 110 },
      },
      {
        accessorKey: 'verifiedPhoneMasked',
        header: '인증 전화',
        meta: { width: 140 },
        cell: ({ row }) => (
          <span className="font-mono text-[12px]">{row.original.verifiedPhoneMasked}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: '상태',
        meta: { width: 100 },
        cell: ({ row }) => (
          <Pill tone={statusTone(row.original.status)}>
            {REVIEW_STATUS_LABELS[row.original.status]}
          </Pill>
        ),
      },
      {
        accessorKey: 'reviewedAt',
        header: '처리일시',
        meta: { width: 150 },
        cell: ({ row }) =>
          row.original.reviewedAt ? formatDateTime(row.original.reviewedAt) : '—',
      },
      {
        accessorKey: 'reviewNote',
        header: '메모',
        meta: { width: 200 },
        cell: ({ row }) => (
          <span className="text-ink-2" title={row.original.reviewNote ?? ''}>
            {row.original.reviewNote ?? '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        meta: { width: 100, align: 'right', sticky: 'right' },
        cell: ({ row }) =>
          row.original.status === 'manual_review' || row.original.status === 'pending' ? (
            <Button variant="outline" size="sm" onClick={() => setReviewTarget(row.original)}>
              심사
            </Button>
          ) : null,
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
        title="본인인증 심사"
        subtitle="자동 매칭 실패 건 — 성명 검색 + 전화번호(마스킹) 대조로 교육생을 연결해요"
      />

      <FilterBar>
        <FilterRow label="필터">
          <Select
            className="w-36"
            value={status}
            onChange={(e) => updateParams({ status: e.target.value || null })}
          >
            {Object.entries(REVIEW_STATUS_LABELS).map(([value, label]) => (
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
        emptyMessage="해당 상태의 심사 건이 없어요"
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) }, false)}
        paginationInfo={`총 ${total.toLocaleString()}건 · ${page}/${totalPages}페이지`}
        columnDividers
      />

      <ReviewDialog review={reviewTarget} onClose={() => setReviewTarget(null)} />
    </PageContainer>
  )
}
