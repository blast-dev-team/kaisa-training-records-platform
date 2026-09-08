import { Link, NavLink, Outlet } from "react-router";
import { cn } from "@/src/shared/utils/cn";
import lnpLogo from "@/src/assets/lnp-logo.png";

const NAV_ITEMS = [
  { to: "/training-history", label: "교육이력 조회" },
  { to: "/payment-history", label: "발급 결제 내역" },
  { to: "/verify", label: "진위확인" },
] as const;

/** 인증 완료 후 본문 레이아웃 — 좌측 사이드바 + 콘텐츠 */
export function MainLayout() {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line">
        <div className="flex h-16 items-center border-b border-line px-5">
          <Link to="/">
            <img src={lnpLogo} alt="KAISA" className="h-8" />
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "rounded-lg px-3 py-2 text-sm font-semibold",
                  isActive
                    ? "bg-primary-50 text-primary-600"
                    : "text-gray-600 hover:bg-gray-50 hover:text-ink",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <Link
            to="/terms"
            className="block rounded-lg px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:text-ink"
          >
            이용약관
          </Link>
        </div>
      </aside>

      <main className="flex-1 px-8 py-10">
        <Outlet />
      </main>
    </div>
  );
}
