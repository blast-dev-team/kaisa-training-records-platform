import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import type { ColumnDef } from '@tanstack/react-table'
import { AppTable } from '@/src/shared/ui/app-table'
import { FilterBar, FilterRow } from '@/src/shared/ui/filter-bar'
import { Button } from '@/src/shared/ui/button'
import { Dialog } from '@/src/shared/ui/dialog'
import { Input } from '@/src/shared/ui/input'
import { SearchInput } from '@/src/shared/ui/search-input'
import { Label } from '@/src/shared/ui/label'
import { PageContainer } from '@/src/shared/ui/page-container'
import { PageHead } from '@/src/shared/ui/page-head'
import { Pill, statusTone } from '@/src/shared/ui/pill'
import { Textarea } from '@/src/shared/ui/textarea'
import { toYMD } from '@/src/shared/utils/format'
import { authQueries } from '@/src/entities/auth'
import {
  allowedEmailQueries,
  ALLOWED_EMAIL_STATUS_LABELS,
  deleteAllowedEmail,
  postAllowedEmail,
  postReissueInviteCode,
  type AllowedEmail,
  type AllowedEmailInvite,
} from '@/src/entities/admin-user'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function AllowedEmailListPage() {
  const { data: me } = useQuery(authQueries.me())

  // 관리자 초대는 총관리자(super)만 — 서버도 require_super 로 막는다
  if (me?.role !== 'super') {
    return (
      <PageContainer>
        <PageHead title="초대 이메일" />
        <div className="rounded-lg border border-line bg-panel p-8 text-center text-13 text-ink-2">
          총관리자(super)만 볼 수 있는 화면이에요.
        </div>
      </PageContainer>
    )
  }

  return <AllowedEmailTable />
}

function AllowedEmailTable() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const { data } = useQuery(allowedEmailQueries.list(q || undefined))

  const [searchInput, setSearchInput] = useState(q)
  const [addOpen, setAddOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<AllowedEmail | null>(null)
  // 발급 직후 한 번만 보여 주는 초대 코드 — 서버엔 해시만 남아 다시 볼 수 없다
  const [issuedInvite, setIssuedInvite] = useState<AllowedEmailInvite | null>(null)

  useEffect(() => {
    if (addOpen) {
      setEmail('')
      setNote('')
    }
  }, [addOpen])

  const addMutation = useMutation({
    mutationFn: () =>
      postAllowedEmail({ email: email.trim(), note: note.trim() || undefined }),
    onSuccess: (invite) => {
      setAddOpen(false)
      setIssuedInvite(invite)
      queryClient.invalidateQueries({ queryKey: allowedEmailQueries.all() })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const reissueMutation = useMutation({
    mutationFn: (allowedEmailId: string) => postReissueInviteCode(allowedEmailId),
    onSuccess: (invite) => {
      setIssuedInvite(invite)
      queryClient.invalidateQueries({ queryKey: allowedEmailQueries.all() })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const copyInviteCode = async () => {
    if (!issuedInvite) return
    try {
      await navigator.clipboard.writeText(issuedInvite.inviteCode)
      toast.success('초대 코드를 복사했어요')
    } catch (error: unknown) {
      console.error('clipboard write failed', error)
      toast.error('복사하지 못했어요. 코드를 직접 선택해 복사해 주세요')
    }
  }

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
        accessorKey: 'inviteExpiresAt',
        header: '코드 만료',
        meta: { width: 120 },
        cell: ({ row }) => {
          const { status, inviteExpiresAt } = row.original
          if (status !== 'pending') return '—'
          if (!inviteExpiresAt) return <span className="text-ink-3">코드 없음</span>
          const expired = new Date(inviteExpiresAt).getTime() < Date.now()
          return expired ? (
            <span className="text-danger">만료됨</span>
          ) : (
            toYMD(inviteExpiresAt)
          )
        },
      },
      {
        id: 'actions',
        header: '',
        meta: { width: 170, align: 'right' },
        cell: ({ row }) =>
          row.original.status === 'pending' ? (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={reissueMutation.isPending}
                onClick={() => reissueMutation.mutate(row.original.id)}
              >
                코드 재발급
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
          ) : null,
      },
    ],
    [reissueMutation],
  )

  const items = data ?? []

  return (
    <PageContainer>
      <PageHead
        title="관리자 초대 이메일"
        subtitle="초대받은 이메일과 초대 코드로만 관리자 회원가입이 가능해요"
        actions={<Button onClick={() => setAddOpen(true)}>이메일 등록</Button>}
      />

      <FilterBar>
        <FilterRow label="검색">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const next = new URLSearchParams(searchParams)
              if (searchInput.trim()) next.set('q', searchInput.trim())
              else next.delete('q')
              setSearchParams(next, { replace: false })
            }}
          >
            <SearchInput
              className="w-64"
              placeholder="이메일 주소"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onClear={() => {
                const next = new URLSearchParams(searchParams)
                next.delete('q')
                setSearchParams(next, { replace: false })
              }}
            />
            <Button type="submit" variant="secondary" size="sm">
              검색
            </Button>
          </form>
        </FilterRow>
      </FilterBar>

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
        isOpen={issuedInvite !== null}
        onClose={() => setIssuedInvite(null)}
        title="초대 코드"
        actions={[
          { label: '복사', onClick: copyInviteCode },
          { label: '확인', variant: 'primary', onClick: () => setIssuedInvite(null) },
        ]}
      >
        {issuedInvite && (
          <div className="space-y-3 pt-1">
            <p className="text-14 text-ink-2">
              <span className="font-medium text-ink">{issuedInvite.email}</span> 님에게 아래
              코드를 직접 전달해 주세요. 가입 화면에서 이메일과 함께 입력해야 해요.
            </p>
            <p className="select-all rounded-md bg-bg px-4 py-3 text-center font-mono text-20 font-semibold tracking-widest text-ink">
              {issuedInvite.inviteCode}
            </p>
            <p className="text-13 text-ink-3">
              {issuedInvite.inviteExpiresAt
                ? `${toYMD(issuedInvite.inviteExpiresAt)}까지 쓸 수 있어요. `
                : ''}
              이 창을 닫으면 코드를 다시 볼 수 없어요 — 잃어버리면 재발급해 주세요.
            </p>
          </div>
        )}
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
        <p className="pt-1 text-13 text-ink-2">
          삭제하면 해당 이메일로는 회원가입할 수 없어요.
        </p>
      </Dialog>
    </PageContainer>
  )
}
