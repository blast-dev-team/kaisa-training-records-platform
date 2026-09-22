import { Navigate, Outlet } from 'react-router'
import { useQuery } from '@tanstack/react-query'

import { authQueries } from '@/src/entities/auth'
import { Sidebar } from '@/src/widget/sidebar'
import { Header } from '@/src/widget/header'
import { ToastProvider } from '@/src/shared/ui/toast-provider'

/** 어드민 셸 — me 쿼리로 가드. 개인회원(user) 세션이면 로그인으로 돌려보낸다. */
export function AdminLayout() {
  const { data: me, isLoading } = useQuery(authQueries.me())

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-line border-t-accent rounded-full animate-spin" />
          <p className="text-sm text-ink-3">불러오는 중...</p>
        </div>
      </div>
    )
  }

  // 세션 없음(401 → null) 또는 개인회원 세션 → 로그인으로
  if (!me || me.accountType !== 'admin') {
    return <Navigate to="/login" replace />
  }

  return (
    // 콘텐츠가 하한보다 좁아지면 셸 전체가 가로 스크롤한다 (min-w-[1024px] 참고)
    <div className="h-screen overflow-x-auto overflow-y-hidden flex flex-col">
      <div className="grid grid-cols-[auto_1fr] flex-1 min-h-0">
        <Sidebar role={me.role} />
        {/* 콘텐츠 최소 폭 1024px — 뷰포트 1280 − 사이드바 220 − main 패딩 = 스크롤 없음.
            min-w-0 을 대신 쓰지 않는다 — 둘 다 min-width:auto 를 끄므로 내부 truncate 동작은 그대로. */}
        <div className="min-w-[1024px] flex flex-col min-h-0">
          <Header me={me} />
          <main className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-10">
            <div className="max-w-[1440px] mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <ToastProvider />
    </div>
  )
}
