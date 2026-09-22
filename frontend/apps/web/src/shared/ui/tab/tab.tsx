import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/src/shared/utils/cn";

/**
 * KAISA 탭 (언더라인형) — Figma 디자인 시스템 (node 19:18250) 기반.
 *
 * select × leftIcon 변형을 실제 Figma 노드로 확인해 반영.
 * - 선택: 하단 2px primary-700 밑줄 + primary-700 SemiBold 16px 텍스트
 * - 미선택: gray-200 밑줄 + gray-400 텍스트
 * - 부모에서 role="tablist" 요소로 감싸 함께 사용
 */
export interface TabProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "selected"> {
  children: ReactNode;
  /** 텍스트 왼쪽 아이콘 (svg 권장 — 래퍼가 크기를 강제한다) */
  leftIcon?: ReactNode;
  selected?: boolean;
}

export function Tab({
  children,
  leftIcon,
  selected = false,
  className,
  type = "button",
  ...props
}: TabProps) {
  return (
    <button
      type={type}
      role="tab"
      aria-selected={selected}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 p-2 border-b-2 border-solid font-sans text-base leading-normal font-semibold tracking-[-0.03em] whitespace-nowrap transition-colors select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
        selected
          ? "border-primary-700 text-primary-700"
          : "border-gray-200 text-gray-400",
        className,
      )}
      {...props}
    >
      {leftIcon && (
        <span className="size-5 shrink-0 [&>svg]:size-full">{leftIcon}</span>
      )}
      {children}
    </button>
  );
}
