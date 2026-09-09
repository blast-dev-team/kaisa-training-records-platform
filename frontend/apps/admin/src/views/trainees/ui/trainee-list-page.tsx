import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { AppTable } from '@/src/shared/ui/app-table'
import { Button } from '@/src/shared/ui/button'
import { FilterBar, FilterRow } from '@/src/shared/ui/filter-bar'
import { Input } from '@/src/shared/ui/input'
import { PageHead } from '@/src/shared/ui/page-head'
import { PageContainer } from '@/src/shared/ui/page-container'
import { Pill, statusTone } from '@/src/shared/ui/pill'
import { Select } from '@/src/shared/ui/select'
import { toYMD } from '@/src/shared/utils/format'
import {
  membershipGradeQueries,
  traineeQueries,
  TRAINEE_REVIEW_STATUS_LABELS,
  type Trainee,
} from '@/src/entities/trainee'
import { GradeChangeDialog } from './grade-change-dialog'

export function TraineeListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const gradeId = searchParams.get('grade') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)

  const [searchInput, setSearchInput] = useState(q)
  const [gradeTarget, setGradeTarget] = useState<Trainee | null>(null)

  const { data } = useQuery(
    traineeQueries.list({ q, reviewStatus: status, gradeId, page }),
  )
  const { data: grades } = useQuery(membershipGradeQueries.list(true))

  const updateParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    if (resetPage) next.delete('page')
    setSearchParams(next, { replace: false })
  }

  const columns = useMemo<ColumnDef<Trainee, unknown>[]>(
    () => [
      {
        accessorKey: 'traineeNo',
        header: '교육생번호',
        meta: { width: 120 },
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.traineeNo}</span>,
      },
      { accessorKey: 'name', header: '성명', meta: { width: 100 } },
      { accessorKey: 'phoneMasked', header: '전화', meta: { width: 130 } },
      {
        accessorKey: 'email',
        header: '이메일',
        meta: { width: 200 },
        cell: ({ row }) => <span className="text-ink-2">{row.original.email ?? '—'}</span>,
      },
      {
        accessorKey: 'gradeName',
        header: '회원등급',
        meta: { width: 100 },
        cell: ({ row }) => row.original.gradeName ?? '—',
      },
      {
        accessorKey: 'reviewStatus',
        header: '인증상태',
        meta: { width: 100 },
        cell: ({ row }) => (
          <Pill tone={statusTone(row.original.reviewStatus)}>
            {TRAINEE_REVIEW_STATUS_LABELS[row.original.reviewStatus]}
          </Pill>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: '등록일',
        meta: { width: 110 },
        cell: ({ row }) => toYMD(row.original.createdAt) ?? '—',
      },
      {
        id: 'actions',
        header: '',
        meta: { width: 150, align: 'right', sticky: 'right' },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setGradeTarget(row.original)
              }}
            >
              등급변경
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/training-records?trainee_id=${row.original.id}`}>이력</Link>
            </Button>
          </div>
        ),
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
        title="교육생 관리"
        subtitle={`총 ${total.toLocaleString()}명`}
      />

      <FilterBar>
        <FilterRow label="검색">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              updateParams({ q: searchInput.trim() || null })
            }}
          >
            <Input
              className="w-64"
              placeholder="성명 · 교육생번호 · 이메일"
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

      <AppTable
        columns={columns}
        data={items}
        isLoading={!data}
        emptyMessage="조건에 맞는 교육생이 없어요"
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) }, false)}
        paginationInfo={`총 ${total.toLocaleString()}명 · ${page}/${totalPages}페이지`}
        columnDividers
      />

      <GradeChangeDialog trainee={gradeTarget} onClose={() => setGradeTarget(null)} />
    </PageContainer>
  )
}
