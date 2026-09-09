import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { PageContainer } from '@/src/shared/ui/page-container'
import { PageHead } from '@/src/shared/ui/page-head'
import { formatNumber } from '@/src/shared/utils/format'
import { traineeQueries } from '@/src/entities/trainee'
import { identityReviewQueries } from '@/src/entities/identity-review'
import { certificateQueries } from '@/src/entities/certificate'
import { paymentOrderQueries } from '@/src/entities/payment'

interface KpiProps {
  title: string
  value: number | undefined
  to: string
  hint: string
  emphasis?: boolean
}

function KpiCard({ title, value, to, hint, emphasis }: KpiProps) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-2 rounded-lg border border-line bg-panel p-5 transition-colors hover:border-accent"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-ink-2">{title}</h3>
        <ChevronRight className="h-4 w-4 text-ink-3 transition-transform group-hover:translate-x-0.5" />
      </div>
      {value === undefined ? (
        <div className="h-9 w-24 animate-pulse rounded bg-panel-2" />
      ) : (
        <p
          className={`text-[28px] font-semibold leading-none tabular-nums ${
            emphasis && value > 0 ? 'text-accent' : 'text-ink'
          }`}
        >
          {formatNumber(value)}
          <span className="ml-1 text-[14px] font-normal text-ink-3">건</span>
        </p>
      )}
      <p className="text-[12px] text-ink-3">{hint}</p>
    </Link>
  )
}

export function DashboardPage() {
  const { data: trainees } = useQuery(traineeQueries.list({ page: 1 }))
  const { data: reviews } = useQuery(
    identityReviewQueries.list({ status: 'manual_review', page: 1 }),
  )
  const { data: certificates } = useQuery(certificateQueries.list({ status: 'issued', page: 1 }))
  const { data: payments } = useQuery(paymentOrderQueries.list({ status: 'paid', page: 1 }))

  return (
    <PageContainer>
      <PageHead title="대시보드" subtitle="주요 지표와 바로가기" />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          title="심사 대기"
          value={reviews?.total}
          to="/identity-reviews"
          hint="자동 매칭 실패 건 — 처리가 필요해요"
          emphasis
        />
        <KpiCard
          title="교육생"
          value={trainees?.total}
          to="/trainees"
          hint="등록된 감리원 교육생"
        />
        <KpiCard
          title="발급된 확인서"
          value={certificates?.total}
          to="/certificates"
          hint="현재 유효한 발급 내역"
        />
        <KpiCard
          title="결제 완료"
          value={payments?.total}
          to="/payment-orders"
          hint="결제 완료 주문"
        />
      </div>
    </PageContainer>
  )
}
