import { toUserMessage } from '@/src/shared/lib/friendly-error';
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import type { ColumnDef } from '@tanstack/react-table'
import { AppTable } from '@/src/shared/ui/app-table'
import { Button } from '@/src/shared/ui/button'
import { Dialog } from '@/src/shared/ui/dialog'
import { Input } from '@/src/shared/ui/input'
import { Label } from '@/src/shared/ui/label'
import { PageContainer } from '@/src/shared/ui/page-container'
import { PageHead } from '@/src/shared/ui/page-head'
import { Pill, statusTone } from '@/src/shared/ui/pill'
import { Select } from '@/src/shared/ui/select'
import { formatDateTime, toYMD } from '@/src/shared/utils/format'
import { authQueries, type AdminRole, type Me } from '@/src/entities/auth'
import {
  ADMIN_ROLE_LABELS,
  ADMIN_STATUS_LABELS,
  adminUserQueries,
  patchAdminUser,
  type AdminUser,
} from '@/src/entities/admin-user'

export function AdminUserListPage() {
  const { data: me } = useQuery(authQueries.me())
  const isSuper = me?.role === 'super'

  if (!isSuper) {
    return (
      <PageContainer>
        <PageHead title="관리자 계정" />
        <div className="rounded-lg border border-line bg-panel p-8 text-center text-13 text-ink-2">
          총관리자(super)만 볼 수 있는 화면이에요.
        </div>
      </PageContainer>
    )
  }

  return <AdminUserTable me={me} />
}

function AdminUserTable({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const { data, error: listError, refetch: refetchList } = useQuery(adminUserQueries.list())

  const [blockTarget, setBlockTarget] = useState<AdminUser | null>(null)
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null)

  const statusMutation = useMutation({
    mutationFn: (input: { admin: AdminUser; status: 'active' | 'disabled' }) =>
      patchAdminUser(input.admin.id, { status: input.status }),
    onSuccess: (_d, input) => {
      toast.success(
        input.status === 'disabled'
          ? '계정을 차단하고 로그아웃시켰어요'
          : '계정을 복구했어요. 다시 로그인하면 사용할 수 있어요',
      )
      setBlockTarget(null)
      queryClient.invalidateQueries({ queryKey: adminUserQueries.all() })
    },
    onError: (e: Error) => toast.error(toUserMessage(e)),
  })

  const editMutation = useMutation({
    mutationFn: (input: {
      admin: AdminUser
      body: { name?: string; role?: AdminRole; password?: string }
    }) => patchAdminUser(input.admin.id, input.body),
    onSuccess: (_d, input) => {
      toast.success(
        input.body.password ? '비밀번호를 재설정했어요' : '관리자 정보를 수정했어요',
      )
      setEditTarget(null)
      queryClient.invalidateQueries({ queryKey: adminUserQueries.all() })
    },
    onError: (e: Error) => toast.error(toUserMessage(e)),
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
        cell: ({ row }) => ADMIN_ROLE_LABELS[row.original.role] ?? row.original.role,
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
        meta: { width: 130, align: 'right' },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditTarget(row.original)}
            >
              수정
            </Button>
            {row.original.status === 'active' ? (
              // 내 계정은 차단할 수 없다(서버도 400) — 버튼을 보이지 않는다
              row.original.id === me.id ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:text-danger"
                  onClick={() => setBlockTarget(row.original)}
                >
                  차단
                </Button>
              )
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
            )}
          </div>
        ),
      },
    ],
    [statusMutation.isPending, me.id],
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
        isLoading={!data && !listError}
        error={listError}
        onRetry={() => void refetchList()}
        emptyMessage="관리자 계정이 없어요"
        columnDividers
      />

      <Dialog
        isOpen={blockTarget !== null}
        onClose={() => setBlockTarget(null)}
        title="계정을 차단할까요?"
        size="sm"
        description={
          blockTarget
            ? `${blockTarget.name} (${blockTarget.email}) 님은 지금 바로 로그아웃되고, 복구하기 전까지 로그인할 수 없어요.`
            : undefined
        }
        actions={[
          { label: '취소', onClick: () => setBlockTarget(null) },
          {
            label: '차단하고 로그아웃',
            variant: 'danger',
            isLoading: statusMutation.isPending,
            onClick: () => blockTarget && statusMutation.mutate({ admin: blockTarget, status: 'disabled' }),
          },
        ]}
      >
        <p className="pt-1 text-13 text-ink-2">
          · 작업 중이던 내용은 저장되지 않을 수 있어요.<br />
          · 복구해도 자동으로 로그인되지 않고, 다시 로그인해야 해요.<br />
          · 지금까지의 감사 로그는 그대로 남아요.
        </p>
      </Dialog>

      {editTarget && (
        <EditDialog
          key={editTarget.id}
          admin={editTarget}
          meId={me.id}
          isPending={editMutation.isPending}
          onClose={() => setEditTarget(null)}
          onSave={body => editMutation.mutate({ admin: editTarget, body })}
        />
      )}
    </PageContainer>
  )
}

function EditDialog({
  admin,
  meId,
  isPending,
  onClose,
  onSave,
}: {
  admin: AdminUser
  meId: string
  isPending: boolean
  onClose: () => void
  onSave: (body: { name?: string; role?: AdminRole; password?: string }) => void
}) {
  // 이름이 비어 있는(등록 시 미입력) 관리자 대비 — null 방어
  const [name, setName] = useState(admin.name ?? '')
  const [role, setRole] = useState<AdminRole>(admin.role)
  const [newPassword, setNewPassword] = useState('')

  const isSelf = admin.id === meId
  const trimmed = name.trim()
  const isValidPassword =
    newPassword.length === 0 ||
    (newPassword.length >= 10 && /[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword))
  const canSave = trimmed.length > 0 && trimmed.length <= 100 && isValidPassword

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title="관리자 정보 수정"
      size="sm"
      description={`${admin.email} — 이메일은 변경할 수 없어요.`}
      actions={[
        { label: '취소', onClick: onClose },
        {
          label: '저장',
          isDisabled: !canSave,
          isLoading: isPending,
          onClick: () => {
            if (!canSave) return
            const body: { name?: string; role?: AdminRole; password?: string } = {}
            if (trimmed !== admin.name) body.name = trimmed
            if (!isSelf && role !== admin.role) body.role = role
            if (newPassword) body.password = newPassword
            // 변경 없음 — 그냥 닫기
            if (Object.keys(body).length === 0) {
              onClose()
              return
            }
            onSave(body)
          },
        },
      ]}
    >
      <div className="flex flex-col gap-4 pt-1">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-name">이름 <span className="text-danger">*</span></Label>
          <Input
            id="admin-name"
            value={name}
            maxLength={100}
            placeholder="이름을 입력해 주세요"
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-role">역할</Label>
          <Select
            id="admin-role"
            value={role}
            disabled={isSelf}
            onChange={e => setRole(e.target.value as AdminRole)}
          >
            <option value="super">{ADMIN_ROLE_LABELS.super}</option>
            <option value="staff">{ADMIN_ROLE_LABELS.staff}</option>
          </Select>
          {isSelf && (
            <p className="text-12 text-ink-2">
              내 계정의 역할은 변경할 수 없어요. 다른 총관리자에게 부탁해 주세요.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-password">새 비밀번호</Label>
          <Input
            id="admin-password"
            type="password"
            autoComplete="new-password"
            placeholder="비워두면 변경하지 않아요"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
          />
          {newPassword.length > 0 && !isValidPassword && (
            <p className="text-12 text-danger">
              10자 이상, 영문과 숫자를 조합해 주세요
            </p>
          )}
        </div>
      </div>
    </Dialog>
  )
}
