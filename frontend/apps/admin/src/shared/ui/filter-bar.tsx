import type { ReactNode } from 'react'

/** 목록 페이지 표준 필터 툴바 — 컨테이너(보더 + 옅은 배경) 안에 FilterRow 들을 쌓는다. */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-panel-2/30 px-4 py-3">
      {children}
    </div>
  )
}

/** 필터 한 줄 — 좌측 고정폭 라벨 + 우측 컨트롤(칩/셀렉트/검색) */
export function FilterRow({ label, children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {label !== undefined && (
        <span className="w-16 shrink-0 text-[13px] text-ink-3">{label}</span>
      )}
      {children}
    </div>
  )
}
