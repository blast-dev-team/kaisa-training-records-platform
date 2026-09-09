import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { AppTable } from '@/src/shared/ui/app-table'
import { Button } from '@/src/shared/ui/button'
import { PageContainer } from '@/src/shared/ui/page-container'
import { PageHead } from '@/src/shared/ui/page-head'
import { Pill } from '@/src/shared/ui/pill'
import { toYMD } from '@/src/shared/utils/format'
import { membershipGradeQueries, type MembershipGrade } from '@/src/entities/trainee'
import { GradeFormDialog } from './grade-form-dialog'

export function MembershipGradeListPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<MembershipGrade | null>(null)

  const { data: grades } = useQuery(membershipGradeQueries.list())

  const columns = useMemo<ColumnDef<MembershipGrade, unknown>[]>(
    () => [
      {
        accessorKey: 'sortOrder',
        header: '순서',
        meta: { width: 70, align: 'right' },
      },
      {
        accessorKey: 'name',
        header: '등급명',
        meta: { width: 160 },
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.name}</span>,
      },
      {
        accessorKey: 'code',
        header: '코드',
        meta: { width: 120 },
        cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.code}</span>,
      },
      {
        accessorKey: 'description',
        header: '설명',
        meta: { width: 260 },
        cell: ({ row }) => (
          <span className="text-ink-2" title={row.original.description ?? ''}>
            {row.original.description ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'isActive',
        header: '상태',
        meta: { width: 110 },
        cell: ({ row }) => (
          <Pill tone={row.original.isActive ? 'ok' : 'default'}>
            {row.original.isActive ? '사용중' : '비활성'}
          </Pill>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: '등록일',
        meta: { width: 120 },
        cell: ({ row }) => toYMD(row.original.createdAt) ?? '—',
      },
      {
        id: 'actions',
        header: '',
        meta: { width: 90, align: 'right', sticky: 'right' },
        cell: ({ row }) => (
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
        ),
      },
    ],
    [],
  )

  return (
    <PageContainer>
      <PageHead
        title="회원등급 관리"
        subtitle="일반 · 연간 · 평생 등 교육생 등급 마스터"
        actions={
          <Button
            onClick={() => {
              setEditTarget(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" /> 등급 등록
          </Button>
        }
      />

      <AppTable
        columns={columns}
        data={grades ?? []}
        isLoading={!grades}
        emptyMessage="등록된 등급이 없어요. 첫 등급을 등록해 보세요"
      />

      <GradeFormDialog
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        grade={editTarget}
      />
    </PageContainer>
  )
}
