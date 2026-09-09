import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import type { ColumnDef } from '@tanstack/react-table'
import { AppTable } from '@/src/shared/ui/app-table'
import { Button } from '@/src/shared/ui/button'
import { Dialog } from '@/src/shared/ui/dialog'
import { PageContainer } from '@/src/shared/ui/page-container'
import { PageHead } from '@/src/shared/ui/page-head'
import { Pill, statusTone } from '@/src/shared/ui/pill'
import { formatDateTime, toYMD } from '@/src/shared/utils/format'
import { authQueries } from '@/src/entities/auth'
import {
  ADMIN_STATUS_LABELS,
  adminUserQueries,
  patchAdminUser,
  type AdminUser,
} from '@/src/entities/admin-user'

const ROLE_LABELS: Record<string, string> = { super: '총관리자', staff: '일반' }

export function AdminUserListPage() {
  const { data: me } = useQuery(authQueries.me())
  const isSuper = me?.role === 'super'

  if (!isSuper) {
    return (
      <PageContainer>
        <PageHead title="관리자 계정" />
        <div className="rounded-lg border border-line bg-panel p-8 text-center text-[13px] text-ink-2">
          총관리자(super)만 볼 수 있는 화면이에요.
        </div>
      </PageContainer>
    )
  }

  return <AdminUserTable />
}

function AdminUserTable() {
  const queryClient = useQueryClient()
  const { data } = useQuery(adminUserQueries.list())

  const [blockTarget, setBlockTarget] = useState<AdminUser | null>(null)

  const statusMutation = useMutation({
    mutationFn: (input: { admin: AdminUser; status: 'active' | 'disabled' }) =>
      patchAdminUser(input.admin.id, input.status),
    onSuccess: (_d, input) => {
      toast.success(input.status === 'disabled' ? '계정을 차단했어요' : '계정을 복구했어요')
      setBlockTarget(null)
      queryClient.invalidateQueries({ queryKey: adminUserQueries.all() })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const columns = useMemo<ColumnDef<AdminUser, unknown>[]>(
    () => [
      {
        accessorKey: 'email',
        header: '이메일',
        meta: { width: 240 },
        cell: ({ row }) => (
          <span className="font-medium text-ink">{row.original.email}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: '이름',
        meta: { width: 120 },
      },
      {
        accessorKey: 'role',
        header: '역할',
        meta: { width: 100 },
        cell: ({ row }) => ROLE_LABELS[row.original.role] ?? row.original.role,
      },
      {
        accessorKey: 'status',
        header: '상태',
        meta: { width: 100 },
        cell: ({ row }) => (
          <Pill tone={statusTone(row.original.status)}>
            {ADMIN_STATUS_LABELS[row.original.status]}
          </Pill>
        ),
      },
      {
        accessorKey: 'lastLoginAt',
        header: '최근 로그인',
        meta: { width: 160 },
        cell: ({ row }) =>
          row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt) : '—',
      },
      {
        accessorKey: 'createdAt',
        header: '생성일',
        meta: { width: 110 },
        cell: ({ row }) => toYMD(row.original.createdAt),
      },
      {
        id: 'actions',
        header: '',
        meta: { width: 90, align: 'right', sticky: 'right' },
        cell: ({ row }) =>
          row.original.status === 'active' ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:text-danger"
              onClick={() => setBlockTarget(row.original)}
            >
              차단
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={statusMutation.isPending}
              onClick={() =>
                statusMutation.mutate({ admin: row.original, status: 'active' })
              }
            >
              복구
            </Button>
          ),
      },
    ],
    [statusMutation.isPending],
  )

  const items = data ?? []

  return (
    <PageContainer>
      <PageHead
        title="관리자 계정"
        subtitle={`총 ${items.length}명 — 차단하면 해당 계정은 로그인할 수 없어요`}
      />

      <AppTable
        columns={columns}
        data={items}
        isLoading={!data}
        emptyMessage="관리자 계정이 없어요"
        columnDividers
      />

      <Dialog
        isOpen={blockTarget !== null}
        onClose={() => setBlockTarget(null)}
        title="계정 차단"
        size="sm"
        description={
          blockTarget
            ? `${blockTarget.name} (${blockTarget.email}) 님이 로그인할 수 없게 돼요.`
            : undefined
        }
        actions={[
          { label: '취소', onClick: () => setBlockTarget(null) },
          {
            label: '차단',
            variant: 'danger',
            isLoading: statusMutation.isPending,
            onClick: () => blockTarget && statusMutation.mutate({ admin: blockTarget, status: 'disabled' }),
          },
        ]}
      >
        <p className="pt-1 text-[13px] text-ink-2">
          차단해도 감사 로그는 남아요. 필요하면 복구할 수 있어요.
        </p>
      </Dialog>
    </PageContainer>
  )
}
