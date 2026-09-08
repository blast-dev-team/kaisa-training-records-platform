import { Link } from "react-router";

import { cn } from "@/src/shared/utils/cn";

const FOOTER_LINKS = [
  { label: "이용약관", to: "/terms" },
  { label: "개인정보 수집·이용 동의", to: "/terms?tab=privacy" },
  { label: "환불정책", to: "/terms?tab=refund" },
] as const;

export interface FooterProps {
  className?: string;
}

/**
 * 하단 푸터 — Figma 디자인 시스템 (node 19:25762) 기반.
 *
 * 약관 링크(gray-600 14px, 32px 간격) + 저작권 표시(gray-400 13px) 중앙 정렬.
 */
export function Footer({ className }: FooterProps) {
  return (
    <footer
      className={cn(
        "flex flex-col items-center justify-center gap-4 border-t border-solid border-gray-200 bg-gray-100 px-20 py-8 font-sans leading-normal",
        className,
      )}
    >
      <nav className="flex w-full items-center justify-center gap-8 text-sm whitespace-nowrap text-gray-600">
        {FOOTER_LINKS.map((link) => (
          <Link
            key={link.label}
            to={link.to}
            className="shrink-0 hover:text-ink"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="shrink-0 text-[13px] text-gray-400">
        © 대한감리교육협회
      </p>
    </footer>
  );
}
