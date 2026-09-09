import { useEffect, useMemo, useState } from 'react'
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
import { Textarea } from '@/src/shared/ui/textarea'
import { toYMD } from '@/src/shared/utils/format'
import {
  allowedEmailQueries,
  ALLOWED_EMAIL_STATUS_LABELS,
  deleteAllowedEmail,
  postAllowedEmail,
  type AllowedEmail,
} from '@/src/entities/admin-user'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function AllowedEmailListPage() {
  const queryClient = useQueryClient()
  const { data } = useQuery(allowedEmailQueries.list())

  const [addOpen, setAddOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<AllowedEmail | null>(null)

  useEffect(() => {
    if (addOpen) {
      setEmail('')
      setNote('')
    }
  }, [addOpen])

  const addMutation = useMutation({
    mutationFn: () =>
      postAllowedEmail({ email: email.trim(), note: note.trim() || undefined }),
    onSuccess: () => {
      toast.success('초대 이메일을 등록했어요 — 해당 이메일로 회원가입할 수 있어요')
      setAddOpen(false)
      queryClient.invalidateQueries({ queryKey: allowedEmailQueries.all() })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteAllowedEmail(deleteTarget!.id),
    onSuccess: () => {
      toast.success('초대를 삭제했어요')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: allowedEmailQueries.all() })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const columns = useMemo<ColumnDef<AllowedEmail, unknown>[]>(
    () => [
      {
        accessorKey: 'email',
        header: '이메일',
        meta: { width: 260 },
        cell: ({ row }) => (
          <span className="font-medium text-ink">{row.original.email}</span>
        ),
      },
      {
        accessorKey: 'note',
        header: '메모',
        meta: { width: 220 },
        cell: ({ row }) => (
          <span className="text-ink-2" title={row.original.note ?? ''}>
            {row.original.note ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: '상태',
        meta: { width: 110 },
        cell: ({ row }) => (
          <Pill tone={statusTone(row.original.status)}>
            {ALLOWED_EMAIL_STATUS_LABELS[row.original.status]}
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
        cell: ({ row }) =>
          row.original.status === 'pending' ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:text-danger"
              onClick={() => setDeleteTarget(row.original)}
            >
              삭제
            </Button>
          ) : null,
      },
    ],
    [],
  )

  const items = data ?? []

  return (
    <PageContainer>
      <PageHead
        title="관리자 초대 이메일"
        subtitle="등록된 이메일만 관리자 회원가입이 가능해요"
        actions={<Button onClick={() => setAddOpen(true)}>이메일 등록</Button>}
      />

      <AppTable
        columns={columns}
        data={items}
        isLoading={!data}
        emptyMessage="등록된 초대 이메일이 없어요"
        columnDividers
      />

      <Dialog
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        title="초대 이메일 등록"
        actions={[
          { label: '취소', onClick: () => setAddOpen(false) },
          {
            label: '등록',
            variant: 'primary',
            isLoading: addMutation.isPending,
            isDisabled: !EMAIL_RE.test(email.trim()),
            onClick: () => addMutation.mutate(),
          },
        ]}
      >
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>이메일</Label>
            <Input
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>메모 (선택)</Label>
            <Textarea
              rows={2}
              placeholder="예: 운영팀 김OO 님"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="초대 삭제"
        size="sm"
        description={
          deleteTarget ? `${deleteTarget.email} — 아직 가입하지 않은 초대예요.` : undefined
        }
        actions={[
          { label: '취소', onClick: () => setDeleteTarget(null) },
          {
            label: '삭제',
            variant: 'danger',
            isLoading: deleteMutation.isPending,
            onClick: () => deleteMutation.mutate(),
          },
        ]}
      >
        <p className="pt-1 text-[13px] text-ink-2">
          삭제하면 해당 이메일로는 회원가입할 수 없어요.
        </p>
      </Dialog>
    </PageContainer>
  )
}
