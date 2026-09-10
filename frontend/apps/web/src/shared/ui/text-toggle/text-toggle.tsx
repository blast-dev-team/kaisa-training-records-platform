import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/src/shared/utils/cn";

/**
 * KAISA 텍스트 토글 — Figma 디자인 시스템 (node 19:18189) 기반.
 *
 * shape(oval/square) × size(l/m/s) × selected × leftIcon 변형 매트릭스를
 * 실제 Figma 노드로 확인해 반영.
 * - 미선택 gray-100 배경·gray-900 텍스트, 선택 primary-700 배경·white 텍스트
 * - square 모서리: l 12px / m 8px / s 4px, oval은 pill
 * - 타이포: Pretendard Regular, l 20 / m 16 / s 12px
 */
export type TextToggleSize = "l" | "m" | "s";

export type TextToggleShape = "oval" | "square";

export interface TextToggleProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "selected"> {
  children: ReactNode;
  /** 텍스트 왼쪽 아이콘 (svg 권장 — 래퍼가 크기를 강제한다) */
  leftIcon?: ReactNode;
  selected?: boolean;
  shape?: TextToggleShape;
  size?: TextToggleSize;
}

const SIZE: Record<TextToggleSize, string> = {
  l: "gap-2 px-4 py-2 text-xl",
  m: "gap-2 px-3 py-2 text-base",
  s: "gap-1 px-2 py-1 text-xs",
};

/** square 모서리 radius — oval은 rounded-full */
const SQUARE_RADIUS: Record<TextToggleSize, string> = {
  l: "rounded-xl",
  m: "rounded-lg",
  s: "rounded-[4px]",
};

const ICON_SIZE: Record<TextToggleSize, string> = {
  l: "size-6",
  m: "size-5",
  s: "size-4",
};

export function TextToggle({
  children,
  leftIcon,
  selected = false,
  shape = "oval",
  size = "m",
  className,
  type = "button",
  ...props
}: TextToggleProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center font-sans leading-normal tracking-[-0.03em] whitespace-nowrap transition-colors select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
        SIZE[size],
        shape === "oval" ? "rounded-full" : SQUARE_RADIUS[size],
        selected ? "bg-primary-700 text-white" : "bg-gray-100 text-gray-900",
        className,
      )}
      {...props}
    >
      {leftIcon && (
        <span className={cn("shrink-0 [&>svg]:size-full", ICON_SIZE[size])}>
          {leftIcon}
        </span>
      )}
      {children}
    </button>
  );
}
