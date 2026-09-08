import { NavLink } from "react-router";

import { cn } from "@/src/shared/utils/cn";

const SIDEBAR_NAV_ITEMS = [
  { label: "교육이력 조회", to: "/training-history" },
  { label: "발급·결제 내역", to: "/payment-history" },
  { label: "진위확인", to: "/verify" },
] as const;

export interface SidebarProps {
  /** 인증된 사용자 표시명 */
  userName?: string;
  /** 인증 남은 시간 표시 (예: "인증 유효 09:24") */
  authTimeLabel?: string;
  /** 인증 해제 버튼 클릭 핸들러 */
  onReleaseAuth?: () => void;
  className?: string;
}

/**
 * 좌측 사이드바 — Figma 디자인 시스템 (node 25:2510) 기반.
 *
 * - 선택 항목: primary-700 배경 + white SemiBold 15px
 * - 미선택 항목: gray-700 Medium 15px
 * - 하단: 사용자명·인증 잔여 시간 + 인증 해제 링크
 */
export function Sidebar({
  userName = "홍○○ 님",
  authTimeLabel = "인증 유효 09:24",
  onReleaseAuth,
  className,
}: SidebarProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col justify-between border-r border-solid border-gray-200 bg-white py-8 font-sans",
        className,
      )}
    >
      <nav className="flex w-full flex-col items-stretch">
        {SIDEBAR_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-start px-5 py-3 text-[15px] leading-normal whitespace-nowrap",
                isActive
                  ? "bg-primary-700 font-semibold text-white"
                  : "font-medium text-gray-700",
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex w-full flex-col gap-5 px-5">
        <div className="flex flex-col gap-2 text-sm leading-normal">
          <p className="font-semibold text-gray-800">{userName}</p>
          <p className="text-gray-600">{authTimeLabel}</p>
        </div>
        <button
          type="button"
          onClick={onReleaseAuth}
          className="w-fit cursor-pointer text-sm font-semibold leading-normal text-gray-500 underline"
        >
          인증 해제
        </button>
      </div>
    </div>
  );
}
