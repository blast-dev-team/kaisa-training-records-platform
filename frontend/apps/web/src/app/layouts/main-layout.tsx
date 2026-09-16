import { useState } from "react";
import { Navigate, Outlet, useNavigate } from "react-router";

import { formatAuthCountdown, useAuthCountdown } from "@/src/shared/hooks/use-auth-countdown";
import { useAuthStore } from "@/src/shared/store/auth-store";
import { AuthReleaseModal } from "@/src/widget/auth-modal";
import { Footer } from "@/src/widget/footer";
import { Header } from "@/src/widget/header";
import { Sidebar } from "@/src/widget/sidebar";

/** 인증 완료 후 본문 레이아웃 — 헤더 + 좌측 사이드바 + 콘텐츠 + 푸터 */
export function MainLayout() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userName = useAuthStore((state) => state.userName);
  const signOut = useAuthStore((state) => state.signOut);
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);
  const remainingSeconds = useAuthCountdown();

  const authTimeLabel =
    remainingSeconds === null ? undefined : `인증 유효 ${formatAuthCountdown(remainingSeconds)}`;

  // 미인증 직접 접근 차단 — URL 입력으로 인증 없이 진입하지 못하게 막는다
  // 10분 타이머 만료로 자동 해제된 경우에도 intro에서 만료 안내 모달로 마무리한다
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  /** 「인증해제」 모달 확인 — 모달 닫고 인증 해제 후 intro로 이동 */
  const handleConfirmRelease = () => {
    setIsReleaseModalOpen(false);
    signOut();
    navigate("/");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1">
        <aside className="w-60 shrink-0">
          <Sidebar
            userName={userName}
            authTimeLabel={authTimeLabel}
            onReleaseAuth={() => setIsReleaseModalOpen(true)}
          />
        </aside>
        <main className="flex flex-1 flex-col px-8 py-10">
          <Outlet />
        </main>
      </div>
      <Footer />
      {isReleaseModalOpen && (
        <AuthReleaseModal onConfirm={handleConfirmRelease} />
      )}
    </div>
  );
}
