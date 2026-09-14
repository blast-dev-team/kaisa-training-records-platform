import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, X } from 'lucide-react'
import { AppTable } from '@/src/shared/ui/app-table'
import { Button } from '@/src/shared/ui/button'
import { Dialog } from '@/src/shared/ui/dialog'
import { FilterBar, FilterRow } from '@/src/shared/ui/filter-bar'
import { PageContainer } from '@/src/shared/ui/page-container'
import { PageHead } from '@/src/shared/ui/page-head'
import { Pill, statusTone } from '@/src/shared/ui/pill'
import { Select } from '@/src/shared/ui/select'
import {
  deleteTrainingRecord,
  trainingRecordQueries,
  COMPLETION_STATUS_LABELS,
  TRAINING_SOURCE_LABELS,
  type TrainingRecord,
} from '@/src/entities/training-record'
import { TrainingRecordFormDialog } from './training-record-form-dialog'

interface Props {
  /** 'external' 이면 외부 수료 전용 뷰 — source 고정, 등록 기본값 external */
  variant?: 'all' | 'external'
}

export function TrainingRecordListPage({ variant = 'all' }: Props) {
  const isExternal = variant === 'external'
  const [searchParams, setSearchParams] = useSearchParams()
  const traineeId = searchParams.get('trainee_id') ?? ''
  const source = isExternal ? 'external' : searchParams.get('source') ?? ''
  const status = searchParams.get('status') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)

  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TrainingRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TrainingRecord | null>(null)

  const { data } = useQuery(
    trainingRecordQueries.list({
      traineeId: traineeId || undefined,
      source: source || undefined,
      completionStatus: status || undefined,
      page,
    }),
  )

  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTrainingRecord(id),
    onSuccess: () => {
      toast.success('이력을 삭제했어요')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: trainingRecordQueries.all() })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    if (resetPage) next.delete('page')
    setSearchParams(next, { replace: false })
  }

  const columns = useMemo<ColumnDef<TrainingRecord, unknown>[]>(
    () => [
      {
        accessorKey: 'courseName',
        header: '과정명',
        meta: { width: 220 },
        cell: ({ row }) => (
          <span className="font-medium text-ink">{row.original.courseName}</span>
        ),
      },
      {
        accessorKey: 'institutionName',
        header: '기관',
        meta: { width: 150 },
        cell: ({ row }) => row.original.institutionName ?? '—',
      },
      {
        id: 'trainee',
        header: '교육생',
        meta: { width: 150 },
        cell: ({ row }) => (
          <span>
            <span className="text-ink">{row.original.traineeName ?? '—'}</span>
            <span className="ml-1.5 text-[11px] text-ink-3">{row.original.traineeNo ?? ''}</span>
          </span>
        ),
      },
      ...(!isExternal
        ? [
            {
              accessorKey: 'source',
              header: '구분',
              meta: { width: 80 },
              cell: ({ row }: { row: { original: TrainingRecord } }) => (
                <Pill tone={statusTone(row.original.source)}>
                  {TRAINING_SOURCE_LABELS[row.original.source]}
                </Pill>
              ),
            } satisfies ColumnDef<TrainingRecord, unknown>,
          ]
        : []),
      {
        accessorKey: 'completionStatus',
        header: '수료상태',
        meta: { width: 100 },
        cell: ({ row }) => (
          <Pill tone={statusTone(row.original.completionStatus)}>
            {COMPLETION_STATUS_LABELS[row.original.completionStatus]}
          </Pill>
        ),
      },
      {
        id: 'hours',
        header: '시수',
        meta: { width: 90, align: 'right' },
        cell: ({ row }) => {
          const { completedHours, totalHours } = row.original
          if (completedHours === null && totalHours === null) return '—'
          return `${completedHours ?? '—'}/${totalHours ?? '—'}`
        },
      },
      {
        id: 'period',
        header: '기간',
        meta: { width: 180 },
        cell: ({ row }) => {
          const s = row.original.startedAt
          const e = row.original.endedAt
          if (!s && !e) return '—'
          return `${s ?? '?'} ~ ${e ?? '진행중'}`
        },
      },
      {
        id: 'actions',
        header: '',
        meta: { width: 130, align: 'right', sticky: 'right' },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditTarget(row.original)
                setFormOpen(true)
              }}
            >
              수정
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:text-danger"
              onClick={() => setDeleteTarget(row.original)}
            >
              삭제
            </Button>
          </div>
        ),
      },
    ],
    [isExternal],
  )

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <PageContainer>
      <PageHead
        title={isExternal ? '외부 수료 관리' : '감리 교육 관리'}
        subtitle={`총 ${total.toLocaleString()}건`}
        actions={
          <Button
            onClick={() => {
              setEditTarget(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" /> 이력 등록
          </Button>
        }
      />

      <FilterBar>
        {traineeId && (
          <FilterRow>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-soft bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-ink">
              교육생 필터 적용중
              <button type="button" onClick={() => updateParams({ trainee_id: null })}>
                <X className="size-3.5" />
              </button>
            </span>
          </FilterRow>
        )}
        <FilterRow label="필터">
          {!isExternal && (
            <Select
              className="w-32"
              value={source}
              onChange={(e) => updateParams({ source: e.target.value || null })}
            >
              <option value="">구분 전체</option>
              {Object.entries(TRAINING_SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
          <Select
            className="w-32"
            value={status}
            onChange={(e) => updateParams({ status: e.target.value || null })}
          >
            <option value="">수료상태 전체</option>
            {Object.entries(COMPLETION_STATUS_LABELS).map(([value, label]) => (
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
        emptyMessage={isExternal ? '등록된 외부 수료 이력이 없어요' : '조건에 맞는 교육이력이 없어요'}
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) }, false)}
        paginationInfo={`총 ${total.toLocaleString()}건 · ${page}/${totalPages}페이지`}
        columnDividers
      />

      <TrainingRecordFormDialog
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        record={editTarget}
        defaultSource={isExternal ? 'external' : 'internal'}
      />

      <Dialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="이력 삭제"
        description={
          deleteTarget
            ? `${deleteTarget.traineeName ?? ''}의 '${deleteTarget.courseName}' 이력을 삭제할까요? 삭제 후에도 감사로그에는 남아요.`
            : undefined
        }
        actions={[
          { label: '취소', onClick: () => setDeleteTarget(null) },
          {
            label: '삭제',
            variant: 'danger',
            isLoading: deleteMutation.isPending,
            onClick: () => {
              if (!deleteTarget) return
              deleteMutation.mutate(deleteTarget.id)
            },
          },
        ]}
      />
    </PageContainer>
  )
}
