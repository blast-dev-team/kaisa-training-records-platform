import { useState } from "react";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router";
import { useMutation } from "@tanstack/react-query";

import { postSessionExtend } from "@/src/shared/api/post-session-extend";
import { formatAuthCountdown, useAuthCountdown } from "@/src/shared/hooks/use-auth-countdown";
import { useAuthStore } from "@/src/shared/store/auth-store";
import { cn } from "@/src/shared/utils/cn";
import { AuthReleaseModal } from "@/src/widget/auth-modal";
import { Footer } from "@/src/widget/footer";
import { Header } from "@/src/widget/header";
import { Sidebar, SIDEBAR_NAV_ITEMS } from "@/src/widget/sidebar";

/** 인증 완료 후 본문 레이아웃 — 헤더 + 좌측 사이드바 + 콘텐츠 + 푸터 */
export function MainLayout() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userName = useAuthStore((state) => state.userName);
  const signIn = useAuthStore((state) => state.signIn);
  const signOut = useAuthStore((state) => state.signOut);
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);
  const remainingSeconds = useAuthCountdown();

  // 잔여 5분 이하 — 사이드바에 인증 연장 버튼 노출
  const canExtend =
    remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds <= 5 * 60;

  const extendMutation = useMutation({
    mutationFn: postSessionExtend,
    onSuccess: (data) => {
      if (data) {
        // 서버가 알려준 새 만료 시각으로 FE 타이머·카운트다운 재설정
        signIn(
          userName,
          new Date(data.expires_at).getTime(),
          undefined,
          useAuthStore.getState().isSuper,
        );
      }
    },
  });

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
      {/* 모바일 — 사이드바 메뉴는 상단 탭으로, 인증 상태는 그 아래 바로 노출한다
          (node 128:2481 TopNavigationBar · 128:2488 UserStatusWidget) */}
      <div className="hidden w-full flex-col font-sans mobile:flex">
        <nav className="flex w-full items-stretch border-b border-solid border-gray-200 bg-white px-3">
          {SIDEBAR_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center border-b-2 px-3 py-2.5 text-sm whitespace-nowrap',
                  isActive
                    ? 'border-primary-700 font-semibold text-primary-700'
                    : 'border-transparent font-medium text-gray-500',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex w-full items-center justify-between bg-gray-100 px-5 py-2.5">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <p className="text-sm font-semibold leading-[1.5] text-gray-800">{userName}</p>
            {authTimeLabel && (
              <p className="text-xs leading-[1.4] text-gray-500">{authTimeLabel}</p>
            )}
          </div>
          <div className="flex items-center gap-3 whitespace-nowrap">
            {/* 데스크톱 사이드바와 같은 조건 — 잔여 5분 이하일 때만 노출 */}
            {canExtend && (
              <button
                type="button"
                onClick={() => extendMutation.mutate()}
                className="cursor-pointer text-sm font-semibold leading-normal text-primary-700 underline"
              >
                인증 연장
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsReleaseModalOpen(true)}
              className="cursor-pointer text-sm font-semibold leading-normal text-gray-500 underline"
            >
              인증 해제
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-1">
        <aside className="w-60 shrink-0 mobile:hidden">
          <Sidebar
            userName={userName}
            authTimeLabel={authTimeLabel}
            showExtendAuth={canExtend}
            onExtendAuth={() => extendMutation.mutate()}
            onReleaseAuth={() => setIsReleaseModalOpen(true)}
          />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col px-8 py-10 mobile:px-5 mobile:pt-5 mobile:pb-10">
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
