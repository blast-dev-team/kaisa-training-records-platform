import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import type { ColumnDef } from '@tanstack/react-table'
import { AppTable } from '@/src/shared/ui/app-table'
import { Button } from '@/src/shared/ui/button'
import { Dialog } from '@/src/shared/ui/dialog'
import { FilterBar, FilterRow } from '@/src/shared/ui/filter-bar'
import { Input } from '@/src/shared/ui/input'
import { PageHead } from '@/src/shared/ui/page-head'
import { PageContainer } from '@/src/shared/ui/page-container'
import { Pill, statusTone } from '@/src/shared/ui/pill'
import { Select } from '@/src/shared/ui/select'
import { toYMD } from '@/src/shared/utils/format'
import { Plus } from 'lucide-react'
import { AlertTriangle } from 'lucide-react'
import {
  deleteTrainee,
  getTraineeDuplicates,
  membershipGradeQueries,
  traineeQueries,
  TRAINEE_REVIEW_STATUS_LABELS,
  type Trainee,
} from '@/src/entities/trainee'
import { GradeChangeDialog } from './grade-change-dialog'
import { TraineeFormDialog } from './trainee-form-dialog'

export function TraineeListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const gradeId = searchParams.get('grade') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)

  const [searchInput, setSearchInput] = useState(q)
  const [gradeTarget, setGradeTarget] = useState<Trainee | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Trainee | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Trainee | null>(null)
  const [duplicatesOpen, setDuplicatesOpen] = useState(false)

  const { data } = useQuery(
    traineeQueries.list({ q, reviewStatus: status, gradeId, page }),
  )
  const { data: grades } = useQuery(membershipGradeQueries.list(true))

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTrainee(id),
    onSuccess: () => {
      toast.success('교육생을 삭제했어요 — 이력·확인서는 보존돼요')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: traineeQueries.all() })
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

  const columns = useMemo<ColumnDef<Trainee, unknown>[]>(
    () => [
      {
        accessorKey: 'traineeNo',
        header: '교육생번호',
        meta: { width: 120 },
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.traineeNo}</span>,
      },
      { accessorKey: 'name', header: '성명', meta: { width: 100 } },
      {
        accessorKey: 'birthDate',
        header: '생년월일',
        meta: { width: 110 },
        cell: ({ row }) => row.original.birthDate ?? '—',
      },
      {
        accessorKey: 'supervisorGrade',
        header: '감리원 등급',
        meta: { width: 100 },
        cell: ({ row }) => row.original.supervisorGrade ?? '—',
      },
      {
        accessorKey: 'certNo',
        header: '감리원증번호',
        meta: { width: 180 },
        cell: ({ row }) => (
          <span
            className="block max-w-[180px] truncate"
            title={row.original.certNo ?? ''}
          >
            {row.original.certNo ?? '—'}
          </span>
        ),
      },
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
        meta: { width: 230, align: 'right', sticky: 'right' },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setEditTarget(row.original)
                setFormOpen(true)
              }}
            >
              수정
            </Button>
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
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:text-danger"
              onClick={(e) => {
                e.stopPropagation()
                setDeleteTarget(row.original)
              }}
            >
              삭제
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
        actions={
          <Button
            onClick={() => {
              setEditTarget(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" /> 교육생 등록
          </Button>
        }
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
              placeholder="성명 · 교육생번호 · 감리원증번호"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Button type="submit" variant="secondary" size="sm">
              검색
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDuplicatesOpen(true)}
            >
              <AlertTriangle className="size-3.5" /> 중복확인
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

      <TraineeFormDialog
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        trainee={editTarget}
      />

      <Dialog
        isOpen={duplicatesOpen}
        onClose={() => setDuplicatesOpen(false)}
        title="감리원증번호 중복 확인"
        description="증번호가 같은 교육생들 — 이름 개명 등으로 발생해요. 클릭해서 수정하세요"
        actions={[{ label: "닫기", onClick: () => setDuplicatesOpen(false) }]}
      >
        <TraineeDuplicates
          onEdit={(t) => {
            setDuplicatesOpen(false);
            setEditTarget(t);
            setFormOpen(true);
          }}
        />
      </Dialog>

      <Dialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="교육생 삭제"
        description={
          deleteTarget
            ? `'${deleteTarget.name}' 교육생을 삭제할까요? 발급 이력·확인서·결제 기록은 보존되고, 목록과 회원 서비스에서만 사라져요. 진행 중인 신청·결제가 있으면 삭제할 수 없어요.`
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


/** 감리원증번호 중복 교육생 목록 — 행 클릭 시 수정, 바로 삭제도 가능 */
function TraineeDuplicates({ onEdit }: { onEdit: (trainee: Trainee) => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['trainees', 'duplicates'],
    queryFn: getTraineeDuplicates,
  });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTrainee(id),
    onSuccess: () => {
      toast.success('교육생을 삭제했어요');
      setConfirmingId(null);
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <p className="p-3 text-[13px] text-ink-3">불러오는 중…</p>;
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return (
      <p className="p-3 text-[13px] text-ink-3">
        중복된 감리원증번호가 없어요
      </p>
    );
  }

  const groups = new Map<string, Trainee[]>();
  for (const t of rows) {
    const key = t.certNo ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  return (
    <div className="max-h-72 space-y-3 overflow-y-auto">
      {[...groups.entries()].map(([certNo, trainees]) => (
        <div key={certNo} className="rounded-md border border-line">
          <p className="border-b border-line bg-bg-2 px-3 py-1.5 text-[12px] font-medium text-ink">
            {certNo}
            <span className="ml-1.5 text-ink-3">({trainees.length}명)</span>
          </p>
          {trainees.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 border-b border-line px-3 py-2 text-[13px] last:border-b-0"
            >
              <button
                type="button"
                className="flex flex-1 items-center gap-2 text-left hover:underline"
                onClick={() => onEdit(t)}
              >
                <span className="text-ink">{t.name}</span>
                <span className="text-[11px] text-ink-3">{t.traineeNo}</span>
                <span className="ml-auto text-[11px] text-ink-3">
                  {t.birthDate ?? '생년월일 없음'}
                </span>
              </button>
              {confirmingId === t.id ? (
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(t.id)}
                  >
                    {deleteMutation.isPending ? '삭제 중…' : '삭제'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingId(null)}
                  >
                    취소
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-danger hover:text-danger"
                  onClick={() => setConfirmingId(t.id)}
                >
                  삭제
                </Button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
