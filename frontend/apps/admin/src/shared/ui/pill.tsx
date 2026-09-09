const TONE_CLASSES: Record<string, string> = {
  default: 'bg-panel-2 text-ink-2 border-line',
  ok: 'bg-ok-soft text-ok-ink border-ok-soft',
  warn: 'bg-warn-soft text-warn-ink border-warn-soft',
  danger: 'bg-danger-soft text-danger border-danger-soft',
  info: 'bg-info-soft text-info border-info-soft',
  accent: 'bg-accent-soft text-accent-ink border-accent-soft',
}

const DOT_CLASSES: Record<string, string> = {
  default: 'bg-ink-3',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-info',
  accent: 'bg-accent',
}

/** kaisa 도메인 상태 → tone (docs/admin/api.md §4 상태값 사전) */
const STATUS_TONE_MAP: Record<string, string> = {
  // 교육생 review_status
  unverified: 'default', pending: 'info', approved: 'ok', rejected: 'danger',
  // 본인인증 심사 status
  manual_review: 'warn',
  // 교육이력 source
  internal: 'info', external: 'accent', legacy_import: 'default',
  // 교육이력 completion_status
  in_progress: 'info', completed: 'ok', canceled: 'default',
  // 확인서 status
  issued: 'ok', revoked: 'danger', superseded: 'default',
  // 결제주문 status
  ready: 'default', paid: 'ok', failed: 'danger',
  partial_refunded: 'warn', refunded: 'info',
  // 발급신청 status (pending은 위와 공유)
  payment_pending: 'info', issuing: 'info',
  // 발급유형
  original: 'info', reissue: 'accent',
  // 관리자 status / 화이트리스트 status
  active: 'ok', disabled: 'default', joined: 'ok',
  // 공통
  inactive: 'default',
}

export function statusTone(status: string): string {
  return STATUS_TONE_MAP[status] ?? 'default'
}

export function Pill({
  tone = 'default',
  children,
}: {
  tone?: string
  children: React.ReactNode
}) {
  const toneClass = TONE_CLASSES[tone] ?? TONE_CLASSES.default
  const dotClass = DOT_CLASSES[tone] ?? DOT_CLASSES.default

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${toneClass}`}
    >
      <span className={`w-2 h-2 rounded-full ${dotClass}`} />
      {children}
    </span>
  )
}
