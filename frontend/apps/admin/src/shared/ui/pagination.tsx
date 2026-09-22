/**
 * 페이지 번호 이동 컨트롤 — « ‹ 1 … 4 5 6 … 12 › »
 *
 * 목록 테이블(AppTable 푸터)이 쓴다.
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  delta = 2,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  /** 현재 페이지 좌우로 몇 개까지 번호를 펼칠지 */
  delta?: number
}) {
  if (totalPages <= 1) return null

  const btnCls =
    'px-2 py-1 text-[12px] text-ink-3 rounded hover:bg-panel-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors'
  const activeCls = 'px-2.5 py-1 text-[12px] rounded font-semibold bg-accent/10 text-accent'
  const inactiveCls =
    'px-2.5 py-1 text-[12px] rounded font-medium text-ink-3 hover:bg-panel-2 transition-colors'

  const start = Math.max(1, page - delta)
  const end = Math.min(totalPages, page + delta)
  const pages: (number | '...')[] = []
  if (start > 1) {
    pages.push(1)
    if (start > 2) pages.push('...')
  }
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < totalPages) {
    if (end < totalPages - 1) pages.push('...')
    pages.push(totalPages)
  }

  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onPageChange(1)} disabled={page === 1} className={btnCls} title="첫 페이지">
        «
      </button>
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1} className={btnCls} title="이전">
        ‹
      </button>
      {pages.map((p, idx) =>
        p === '...' ? (
          <span key={`dots-${idx}`} className="px-2 py-1 text-[11px] text-ink-3">
            …
          </span>
        ) : (
          <button
            type="button"
            key={p}
            onClick={() => onPageChange(p as number)}
            className={page === p ? activeCls : inactiveCls}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className={btnCls}
        title="다음"
      >
        ›
      </button>
      <button
        type="button"
        onClick={() => onPageChange(totalPages)}
        disabled={page === totalPages}
        className={btnCls}
        title="마지막 페이지"
      >
        »
      </button>
    </div>
  )
}
