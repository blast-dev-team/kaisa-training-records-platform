import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/src/shared/utils/cn";

/**
 * KAISA 버튼 탭 (붙는 세그먼트형) — Figma 디자인 시스템 (node 19:18265) 기반.
 *
 * order(first/other/last) × size(l/m/s) × selected × leftIcon 변형 매트릭스를
 * 실제 Figma 노드로 확인해 반영.
 * - 선택: primary-100 배경 + primary-300 1px border + primary-700 SemiBold 텍스트
 * - 미선택: 투명 배경 + primary-700 1px border + primary-700 텍스트
 * - order로 이웃 탭과 붙일 때 border가 겹치지 않게 함
 *   (first만 왼쪽 border, other/last는 상·우·하 border만)
 * - 모서리: first는 왼쪽만, last는 오른쪽만 (l/m 12px / s 8px), other는 없음
 */
export type ButtonTabSize = "l" | "m" | "s";

export type ButtonTabOrder = "first" | "other" | "last";

export interface ButtonTabProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "selected"> {
  children: ReactNode;
  /** 텍스트 왼쪽 아이콘 (svg 권장 — 래퍼가 크기를 강제한다) */
  leftIcon?: ReactNode;
  /** 세그먼트에서의 위치 — 이웃 탭과 붙여 쓸 때 지정 */
  order?: ButtonTabOrder;
  selected?: boolean;
  size?: ButtonTabSize;
}

const SIZE: Record<ButtonTabSize, string> = {
  l: "gap-2 px-5 py-3 text-xl",
  m: "gap-1 px-3 py-2 text-base",
  s: "gap-1 px-2 py-1 text-xs",
};

const ICON_SIZE: Record<ButtonTabSize, string> = {
  l: "size-6",
  m: "size-5",
  s: "size-3",
};

const RADIUS: Record<ButtonTabOrder, Record<"l" | "s", string>> = {
  first: { l: "rounded-l-xl", s: "rounded-l-lg" },
  other: { l: "", s: "" },
  last: { l: "rounded-r-xl", s: "rounded-r-lg" },
};

export function ButtonTab({
  children,
  leftIcon,
  order = "other",
  selected = false,
  size = "m",
  className,
  type = "button",
  ...props
}: ButtonTabProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center border-solid font-sans leading-normal font-semibold tracking-[-0.03em] whitespace-nowrap transition-colors select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
        SIZE[size],
        // first만 왼쪽 border 포함 — 이웃 탭과 붙일 때 border 겹침 방지
        order === "first" ? "border" : "border-t border-r border-b",
        RADIUS[order][size === "s" ? "s" : "l"],
        selected
          ? "border-primary-300 bg-primary-100 text-primary-700"
          : "border-primary-700 bg-transparent text-primary-700",
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
