import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { AppTable } from '@/src/shared/ui/app-table'
import { Button } from '@/src/shared/ui/button'
import { PageContainer } from '@/src/shared/ui/page-container'
import { PageHead } from '@/src/shared/ui/page-head'
import { Pill } from '@/src/shared/ui/pill'
import { toYMD } from '@/src/shared/utils/format'
import {
  courseQueries,
  institutionQueries,
  type Course,
  type Institution,
} from '@/src/entities/institution'
import { InstitutionFormDialog } from './institution-form-dialog'
import { CourseFormDialog } from './course-form-dialog'

const TABS = [
  { key: 'institution', label: '기관' },
  { key: 'course', label: '과정' },
] as const

function ActivePill({ isActive }: { isActive: boolean }) {
  return <Pill tone={isActive ? 'ok' : 'default'}>{isActive ? '사용중' : '비활성'}</Pill>
}

export function InstitutionListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'course' ? 'course' : 'institution'

  const [institutionFormOpen, setInstitutionFormOpen] = useState(false)
  const [editInstitution, setEditInstitution] = useState<Institution | null>(null)
  const [courseFormOpen, setCourseFormOpen] = useState(false)
  const [editCourse, setEditCourse] = useState<Course | null>(null)

  const { data: institutions } = useQuery(institutionQueries.list({}))
  const { data: courses } = useQuery(courseQueries.list({}))

  const setTab = (key: string) => {
    const next = new URLSearchParams(searchParams)
    if (key === 'institution') next.delete('tab')
    else next.set('tab', key)
    setSearchParams(next, { replace: false })
  }

  const institutionColumns = useMemo<ColumnDef<Institution, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: '기관명',
        meta: { width: 240 },
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.name}</span>,
      },
      {
        accessorKey: 'institutionCode',
        header: '기관코드',
        meta: { width: 140 },
        cell: ({ row }) => row.original.institutionCode ?? '—',
      },
      {
        accessorKey: 'isActive',
        header: '상태',
        meta: { width: 110 },
        cell: ({ row }) => <ActivePill isActive={row.original.isActive} />,
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
              setEditInstitution(row.original)
              setInstitutionFormOpen(true)
            }}
          >
            수정
          </Button>
        ),
      },
    ],
    [],
  )

  const courseColumns = useMemo<ColumnDef<Course, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: '과정명',
        meta: { width: 240 },
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.name}</span>,
      },
      {
        accessorKey: 'institutionName',
        header: '소속 기관',
        meta: { width: 160 },
        cell: ({ row }) => row.original.institutionName ?? '—',
      },
      {
        accessorKey: 'courseCode',
        header: '과정코드',
        meta: { width: 120 },
        cell: ({ row }) => row.original.courseCode ?? '—',
      },
      {
        accessorKey: 'category',
        header: '분류',
        meta: { width: 110 },
        cell: ({ row }) => row.original.category ?? '—',
      },
      {
        accessorKey: 'totalHours',
        header: '시수',
        meta: { width: 80, align: 'right' },
        cell: ({ row }) => row.original.totalHours ?? '—',
      },
      {
        accessorKey: 'isActive',
        header: '상태',
        meta: { width: 110 },
        cell: ({ row }) => <ActivePill isActive={row.original.isActive} />,
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
              setEditCourse(row.original)
              setCourseFormOpen(true)
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
        title="기관 · 과정 관리"
        subtitle="이력 등록에서 선택하는 마스터 — 삭제 대신 비활성으로 관리해요"
        actions={
          tab === 'institution' ? (
            <Button
              onClick={() => {
                setEditInstitution(null)
                setInstitutionFormOpen(true)
              }}
            >
              <Plus className="size-4" /> 기관 등록
            </Button>
          ) : (
            <Button
              onClick={() => {
                setEditCourse(null)
                setCourseFormOpen(true)
              }}
            >
              <Plus className="size-4" /> 과정 등록
            </Button>
          )
        }
      />

      <div className="flex items-center gap-1 rounded-lg border border-line bg-panel-2/30 p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              tab === t.key ? 'bg-panel text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="ml-1.5 text-[11px] text-ink-3">
              {t.key === 'institution'
                ? (institutions ?? []).length
                : (courses ?? []).length}
            </span>
          </button>
        ))}
      </div>

      {tab === 'institution' ? (
        <AppTable
          columns={institutionColumns}
          data={institutions ?? []}
          isLoading={!institutions}
          emptyMessage="등록된 기관이 없어요. 첫 기관을 등록해 보세요"
        />
      ) : (
        <AppTable
          columns={courseColumns}
          data={courses ?? []}
          isLoading={!courses}
          emptyMessage="등록된 과정이 없어요. 첫 과정을 등록해 보세요"
        />
      )}

      <InstitutionFormDialog
        isOpen={institutionFormOpen}
        onClose={() => setInstitutionFormOpen(false)}
        institution={editInstitution}
      />
      <CourseFormDialog
        isOpen={courseFormOpen}
        onClose={() => setCourseFormOpen(false)}
        course={editCourse}
      />
    </PageContainer>
  )
}
