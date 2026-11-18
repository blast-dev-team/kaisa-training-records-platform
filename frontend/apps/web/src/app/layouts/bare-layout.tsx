import { Navigate, Outlet } from 'react-router';

import { useAuthStore } from '@/src/shared/store/auth-store';

import { Footer } from '@/src/widget/footer';
import { Header } from '@/src/widget/header';

/** 사이드바 없는 레이아웃 — 교육이력 상세 · 발급완료 */
export function BareLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // 미인증 직접 접근 차단 — MainLayout 과 같은 가드(발급완료 화면도 인증이 필요하다)
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return (
    <div className="flex min-h-screen flex-col">
      {/* 인쇄 시 확인서만 나오도록 크롬은 숨긴다 */}
      <Header className="print:hidden" />
      <main className="flex-1 bg-gray-50">
        <div className="mx-auto w-full max-w-[1400px] px-10 pt-8 pb-15">
          <Outlet />
        </div>
      </main>
      <Footer className="print:hidden" />
    </div>
  );
}
