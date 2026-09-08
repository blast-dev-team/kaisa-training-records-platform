import { Outlet } from "react-router";

/** 사이드바 없는 레이아웃 — 교육이력 상세 · 발급완료 */
export function BareLayout() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Outlet />
    </main>
  );
}
