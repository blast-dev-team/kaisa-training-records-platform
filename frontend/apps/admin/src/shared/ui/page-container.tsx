import type { ReactNode } from 'react'

interface PageContainerProps {
  children: ReactNode
  className?: string
}

/**
 * 공통 페이지 wrapper.
 * - 페이지가 직접 스크롤 영역을 가진다 (`h-full overflow-y-auto`)
 * - 페이지 내 padding(px-4 py-5) 과 세로 gap(gap-4) 을 일관되게 적용
 */
export function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div className={`h-full overflow-y-auto flex flex-col gap-4 px-4 py-5 ${className}`.trim()}>
      {children}
    </div>
  )
}
