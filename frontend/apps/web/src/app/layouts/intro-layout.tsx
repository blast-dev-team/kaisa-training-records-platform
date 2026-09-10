import { Outlet, useLocation } from "react-router";

import { Footer } from "@/src/widget/footer";
import { Header } from "@/src/widget/header";

/** 서비스 안내(기본) 페이지 레이아웃 — 헤더 + 푸터 */
export function IntroLayout() {
  const { pathname } = useLocation();

  // 페이지별 헤더 구성 — 이용약관(node 44:114) · 비인증 진위확인(node 29:2434)
  const variant = pathname.startsWith("/terms")
    ? "terms"
    : pathname === "/verification-no-auth"
      ? "verification"
      : "default";

  return (
    <div className="flex min-h-screen flex-col">
      <Header variant={variant} />
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
