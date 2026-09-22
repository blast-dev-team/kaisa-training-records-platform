import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { PageContainer } from "@/src/shared/ui/page-container";
import { PageHead } from "@/src/shared/ui/page-head";
import { formatNumber, todayYMD } from "@/src/shared/utils/format";
import { traineeQueries } from "@/src/entities/trainee";
import { identityReviewQueries } from "@/src/entities/identity-review";
import { certificateQueries } from "@/src/entities/certificate";
import { paymentOrderQueries, PAYMENT_STATUS_LABELS } from "@/src/entities/payment";
import { courseSessionQueries } from "@/src/entities/course-session";

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 주간 섹션 공통 — 제목 + 바로가기 + 미니 테이블 */
function WeekSection({
  title,
  to,
  linkLabel,
  total,
  emptyMessage,
  head,
  className = "",
  children,
}: {
  title: string;
  to: string;
  linkLabel: string;
  total: number | undefined;
  emptyMessage: string;
  head: string[];
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col rounded-lg border border-line bg-panel ${className}`}
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h3 className="flex items-baseline gap-2 text-[14px] font-semibold text-ink">
          {title}
          {total !== undefined && (
            <span className="text-[12px] font-normal text-ink-3">{total.toLocaleString()}건</span>
          )}
        </h3>
        <Link to={to} className="flex items-center gap-0.5 text-[12px] text-accent hover:underline">
          {linkLabel}
          <ChevronRight className="size-3.5" />
        </Link>
      </div>
      {total === undefined ? (
        <div className="space-y-2 p-5">
          <div className="h-4 w-3/4 animate-pulse rounded bg-panel-2" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-panel-2" />
        </div>
      ) : total === 0 ? (
        <p className="px-5 py-6 text-[13px] text-ink-3">{emptyMessage}</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-ink-3">
              {head.map((h) => (
                <th key={h} className="px-5 py-2 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      )}
    </section>
  );
}

interface KpiProps {
  title: string;
  value: number | undefined;
  to: string;
  hint: string;
  emphasis?: boolean;
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
            emphasis && value > 0 ? "text-accent" : "text-ink"
          }`}
        >
          {formatNumber(value)}
          <span className="ml-1 text-[14px] font-normal text-ink-3">건</span>
        </p>
      )}
      <p className="text-[12px] text-ink-3">{hint}</p>
    </Link>
  );
}

export function DashboardPage() {
  const today = todayYMD();
  const weekEnd = addDays(today, 7);
  const weekAgo = addDays(today, -6);

  const { data: trainees } = useQuery(traineeQueries.list({ page: 1 }));
  const { data: reviews } = useQuery(
    identityReviewQueries.list({ status: "manual_review", page: 1 }),
  );
  const { data: certificates } = useQuery(certificateQueries.list({ status: "issued", page: 1 }));
  const { data: payments } = useQuery(paymentOrderQueries.list({ status: "paid", page: 1 }));
  const { data: weekSessions } = useQuery(
    courseSessionQueries.list({ dateFrom: today, dateTo: weekEnd, limit: 8 }),
  );
  const { data: weekPayments } = useQuery(
    paymentOrderQueries.list({ dateFrom: weekAgo, dateTo: today, limit: 8 }),
  );

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
        <KpiCard title="감리원" value={trainees?.total} to="/trainees" hint="등록된 감리원" />
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <WeekSection
          title="이번 주 교육 일정 (7일 내)"
          to="/course-sessions"
          linkLabel="교육 일정 관리"
          className="xl:col-span-2"
          total={weekSessions?.total}
          emptyMessage="7일 내 예정된 교육 일정이 없어요"
          head={["과정명", "기관", "기간", "수강생"]}
        >
          {(weekSessions?.items ?? []).map((s) => (
            <tr key={s.id} className="border-b border-line last:border-b-0">
              <td className="max-w-[140px] truncate px-5 py-2.5 text-ink" title={s.courseName}>
                {s.courseName}
              </td>
              <td
                className="max-w-[90px] truncate px-5 py-2.5 text-ink-2"
                title={s.institutionName}
              >
                {s.institutionName}
              </td>
              <td className="px-5 py-2.5 tabular-nums text-ink-2">
                {s.startedAt ?? "—"}
                {s.endedAt ? `~${s.endedAt.slice(5)}` : ""}
              </td>
              <td className="px-5 py-2.5 tabular-nums text-ink-2">{s.enrolledCount}명</td>
            </tr>
          ))}
        </WeekSection>

        <WeekSection
          title="최근 7일 결제"
          to="/payment-orders"
          linkLabel="결제 내역"
          total={weekPayments?.total}
          emptyMessage="최근 7일간 결제가 없어요"
          head={["주문번호", "금액", "상태"]}
        >
          {(weekPayments?.items ?? []).map((o) => (
            <tr key={o.id} className="border-b border-line last:border-b-0">
              <td className="px-5 py-2.5 text-ink">{o.orderNo}</td>
              <td className="px-5 py-2.5 tabular-nums text-ink-2">
                {o.amountKrw.toLocaleString()}원
              </td>
              <td className="px-5 py-2.5 text-ink-2">
                {PAYMENT_STATUS_LABELS[o.status] ?? o.status}
              </td>
            </tr>
          ))}
        </WeekSection>
      </div>
    </PageContainer>
  );
}
