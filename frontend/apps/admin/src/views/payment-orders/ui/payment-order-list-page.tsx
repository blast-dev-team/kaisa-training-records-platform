import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import type { ColumnDef } from '@tanstack/react-table'
import { AppTable } from '@/src/shared/ui/app-table'
import { Button } from '@/src/shared/ui/button'
import { Dialog } from '@/src/shared/ui/dialog'
import { FilterBar, FilterRow } from '@/src/shared/ui/filter-bar'
import { Label } from '@/src/shared/ui/label'
import { PageContainer } from '@/src/shared/ui/page-container'
import { PageHead } from '@/src/shared/ui/page-head'
import { Pill, statusTone } from '@/src/shared/ui/pill'
import { Select } from '@/src/shared/ui/select'
import { Textarea } from '@/src/shared/ui/textarea'
import { formatDateTime, formatWon } from '@/src/shared/utils/format'
import {
  paymentOrderQueries,
  PAYMENT_STATUS_LABELS,
  postRefundPaymentOrder,
  type PaymentOrder,
} from '@/src/entities/payment'

export function PaymentOrderListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get('status') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)

  const [refundTarget, setRefundTarget] = useState<PaymentOrder | null>(null)
  const [reason, setReason] = useState('')

  const queryClient = useQueryClient()
  const { data } = useQuery(paymentOrderQueries.list({ status, page }))

  const refundMutation = useMutation({
    mutationFn: () => postRefundPaymentOrder(refundTarget!.id, reason.trim()),
    onSuccess: () => {
      toast.success('환불을 처리했어요')
      setRefundTarget(null)
      queryClient.invalidateQueries({ queryKey: paymentOrderQueries.all() })
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

  const columns = useMemo<ColumnDef<PaymentOrder, unknown>[]>(
    () => [
      {
        accessorKey: 'orderNo',
        header: '주문번호',
        meta: { width: 170 },
        cell: ({ row }) => (
          <span className="font-mono text-[12px] font-medium text-ink">
            {row.original.orderNo}
          </span>
        ),
      },
      {
        accessorKey: 'amountKrw',
        header: '금액',
        meta: { width: 110, align: 'right' },
        cell: ({ row }) => (
          <span className="font-medium tabular-nums text-ink">
            {formatWon(row.original.amountKrw)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: '상태',
        meta: { width: 110 },
        cell: ({ row }) => (
          <Pill tone={statusTone(row.original.status)}>
            {PAYMENT_STATUS_LABELS[row.original.status]}
          </Pill>
        ),
      },
      {
        accessorKey: 'paidAt',
        header: '결제일시',
        meta: { width: 150 },
        cell: ({ row }) => (row.original.paidAt ? formatDateTime(row.original.paidAt) : '—'),
      },
      {
        accessorKey: 'createdAt',
        header: '주문일시',
        meta: { width: 150 },
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        id: 'actions',
        header: '',
        meta: { width: 90, align: 'right', sticky: 'right' },
        cell: ({ row }) =>
          row.original.status === 'paid' ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:text-danger"
              onClick={() => {
                setRefundTarget(row.original)
                setReason('')
              }}
            >
              환불
            </Button>
          ) : null,
      },
    ],
    [],
  )

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <PageContainer>
      <PageHead title="결제 내역" subtitle={`총 ${total.toLocaleString()}건`} />

      <FilterBar>
        <FilterRow label="필터">
          <Select
            className="w-36"
            value={status}
            onChange={(e) => updateParams({ status: e.target.value || null })}
          >
            <option value="">상태 전체</option>
            {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
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
        emptyMessage="결제 내역이 없어요"
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) }, false)}
        paginationInfo={`총 ${total.toLocaleString()}건 · ${page}/${totalPages}페이지`}
        columnDividers
      />

      <Dialog
        isOpen={refundTarget !== null}
        onClose={() => setRefundTarget(null)}
        title="결제 환불"
        size="sm"
        description={
          refundTarget
            ? `${refundTarget.orderNo} — ${formatWon(refundTarget.amountKrw)}를 환불해요.`
            : undefined
        }
        actions={[
          { label: '취소', onClick: () => setRefundTarget(null) },
          {
            label: '환불',
            variant: 'danger',
            isLoading: refundMutation.isPending,
            isDisabled: !reason.trim(),
            onClick: () => refundMutation.mutate(),
          },
        ]}
      >
        <div className="space-y-1.5 pt-1">
          <Label>환불 사유 (필수)</Label>
          <Textarea
            rows={3}
            placeholder="예: 확인서 철회에 따른 환불"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </Dialog>
    </PageContainer>
  )
}
