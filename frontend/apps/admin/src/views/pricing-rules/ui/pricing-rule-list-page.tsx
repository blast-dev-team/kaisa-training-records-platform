import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { AppTable } from '@/src/shared/ui/app-table'
import { Button } from '@/src/shared/ui/button'
import { FilterBar, FilterRow } from '@/src/shared/ui/filter-bar'
import { PageContainer } from '@/src/shared/ui/page-container'
import { PageHead } from '@/src/shared/ui/page-head'
import { Pill } from '@/src/shared/ui/pill'
import { Select } from '@/src/shared/ui/select'
import { formatWon, toYMD } from '@/src/shared/utils/format'
import { membershipGradeQueries } from '@/src/entities/trainee'
import {
  ISSUE_TYPE_LABELS,
  pricingRuleQueries,
  type PricingRule,
} from '@/src/entities/certificate'
import { PricingRuleFormDialog } from './pricing-rule-form-dialog'

export function PricingRuleListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const gradeId = searchParams.get('grade') ?? ''
  const issueType = searchParams.get('type') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PricingRule | null>(null)

  const { data: grades } = useQuery(membershipGradeQueries.list(true))
  const { data } = useQuery(
    pricingRuleQueries.list({
      membershipGradeId: gradeId || undefined,
      issueType: issueType || undefined,
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

  const gradeName = (id: string) => (grades ?? []).find((g) => g.id === id)?.name ?? `#${id}`

  const columns = useMemo<ColumnDef<PricingRule, unknown>[]>(
    () => [
      {
        accessorKey: 'membershipGradeId',
        header: '회원 등급',
        meta: { width: 130 },
        cell: ({ row }) => (
          <span className="font-medium text-ink">{gradeName(row.original.membershipGradeId)}</span>
        ),
      },
      {
        accessorKey: 'issueType',
        header: '발급 유형',
        meta: { width: 110 },
        cell: ({ row }) => ISSUE_TYPE_LABELS[row.original.issueType],
      },
      {
        accessorKey: 'priceKrw',
        header: '금액',
        meta: { width: 120, align: 'right' },
        cell: ({ row }) => (
          <span className="font-medium tabular-nums text-ink">
            {formatWon(row.original.priceKrw)}
          </span>
        ),
      },
      {
        id: 'validPeriod',
        header: '적용 기간',
        meta: { width: 200 },
        cell: ({ row }) => `${toYMD(row.original.validFrom)} ~ ${row.original.validTo ? toYMD(row.original.validTo) : '없음'}`,
      },
      {
        accessorKey: 'isActive',
        header: '상태',
        meta: { width: 100 },
        cell: ({ row }) => (
          <Pill tone={row.original.isActive ? 'ok' : undefined}>
            {row.original.isActive ? '사용중' : '비활성'}
          </Pill>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: '등록일',
        meta: { width: 110 },
        cell: ({ row }) => toYMD(row.original.createdAt),
      },
      {
        id: 'actions',
        header: '',
        meta: { width: 80, align: 'right', sticky: 'right' },
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditTarget(row.original)
              setDialogOpen(true)
            }}
          >
            수정
          </Button>
        ),
      },
    ],
    // grades 비동기 로드 후 등급명 표시 갱신
    [grades],
  )

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <PageContainer>
      <PageHead
        title="요금 규칙"
        subtitle="등급·발급유형별 발급 수수료 — 기간이 겹치면 서버가 거절해요"
        actions={
          <Button
            onClick={() => {
              setEditTarget(null)
              setDialogOpen(true)
            }}
          >
            규칙 등록
          </Button>
        }
      />

      <FilterBar>
        <FilterRow label="필터">
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
          <Select
            className="w-36"
            value={issueType}
            onChange={(e) => updateParams({ type: e.target.value || null })}
          >
            <option value="">유형 전체</option>
            {Object.entries(ISSUE_TYPE_LABELS).map(([value, label]) => (
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
        emptyMessage="요금 규칙이 없어요"
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) }, false)}
        paginationInfo={`총 ${total.toLocaleString()}건 · ${page}/${totalPages}페이지`}
        columnDividers
      />

      <PricingRuleFormDialog
        rule={editTarget}
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </PageContainer>
  )
}
