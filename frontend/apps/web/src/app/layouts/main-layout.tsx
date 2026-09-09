import { useState } from "react";
import { Outlet, useNavigate } from "react-router";

import { useAuthStore } from "@/src/shared/store/auth-store";
import { AuthReleaseModal } from "@/src/widget/auth-modal";
import { Footer } from "@/src/widget/footer";
import { Header } from "@/src/widget/header";
import { Sidebar } from "@/src/widget/sidebar";

/** 인증 완료 후 본문 레이아웃 — 헤더 + 좌측 사이드바 + 콘텐츠 + 푸터 */
export function MainLayout() {
  const navigate = useNavigate();
  const userName = useAuthStore((state) => state.userName);
  const signOut = useAuthStore((state) => state.signOut);
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);

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
