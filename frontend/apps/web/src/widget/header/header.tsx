import { Link } from "react-router";

import { cn } from "@/src/shared/utils/cn";

const HEADER_NAV_ITEMS = [
  { label: "서비스 안내", to: "/" },
  // 발급 수수료 안내 페이지는 아직 라우트가 없어 서비스 안내(/)로 연결
  { label: "발급 수수료", to: "/" },
  { label: "진위확인", to: "/verify" },
] as const;

export interface HeaderProps {
  className?: string;
}

/**
 * 상단 내비게이션 바 — Figma 디자인 시스템 (node 22:2297) 기반.
 *
 * 좌측 서비스명(primary-700 18px Bold) + 우측 메뉴(gray-700 15px Medium, 32px 간격).
 */
export function Header({ className }: HeaderProps) {
  return (
    <header
      className={cn(
        "flex h-16 items-center justify-between border-b border-solid border-gray-200 bg-white px-20 font-sans",
        className,
      )}
    >
      <Link
        to="/"
        className="shrink-0 text-lg font-bold leading-normal text-primary-700"
      >
        KAISA 교육이력 서비스
      </Link>
      <nav className="flex shrink-0 items-center gap-8 text-[15px] font-medium leading-normal whitespace-nowrap text-gray-700">
        {HEADER_NAV_ITEMS.map((item) => (
          <Link key={item.label} to={item.to} className="shrink-0">
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
