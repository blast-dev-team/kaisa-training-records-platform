import { Link, Outlet } from "react-router";
import lnpLogo from "@/src/assets/lnp-logo.png";

/** 서비스 안내(기본) 페이지 레이아웃 — 로고 헤더 + 푸터 약관 링크 */
export function IntroLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
          <Link to="/">
            <img src={lnpLogo} alt="KAISA" className="h-8" />
          </Link>
          <Link
            to="/terms"
            className="text-sm font-semibold text-gray-600 hover:text-ink"
          >
            이용약관
          </Link>
        </div>
      </header>

      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
