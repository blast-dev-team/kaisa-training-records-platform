import type { ReactNode } from "react";

import { XIcon } from "@/src/shared/icon";
import { cn } from "@/src/shared/utils/cn";

/**
 * KAISA 칩 — Figma 디자인 시스템 (node 19:16961) 기반.
 *
 * shape(oval/square) × size(s/m/l) × color(8종) × icon/removeButton/onlyIcon
 * 변형 매트릭스를 실제 Figma 노드로 확인해 반영.
 * - s=10px Regular, m·l=12px SemiBold (l은 수직 패딩만 4px)
 * - 아이콘·X 크기: s·m=12px, l=16px
 * - children 생략 + icon 지정 시 onlyIcon 변형 (고정 정사각 박스 18/21/24px)
 */
export type ChipColor =
  | "gray"
  | "lnpGreen"
  | "yellow"
  | "orange"
  | "red"
  | "green"
  | "indigo"
  | "violet";

export type ChipShape = "oval" | "square";

export type ChipSize = "s" | "m" | "l";

export interface ChipProps {
  /** 칩 텍스트 — 생략 + icon 지정 시 onlyIcon 변형 */
  children?: ReactNode;
  /** 좌측 아이콘 — 크기는 size에 맞춰 자동 (s·m=12px, l=16px) */
  icon?: ReactNode;
  /** 지정 시 우측 X 제거 버튼 표시 (Figma removeButton=on) */
  onRemove?: () => void;
  /** 제거 버튼 스크린리더 라벨 — 생략 시 `{children} 제거` */
  removeLabel?: string;
  color?: ChipColor;
  shape?: ChipShape;
  size?: ChipSize;
  className?: string;
}

const COLOR_CLASSES: Record<ChipColor, string> = {
  gray: "bg-gray-200 border-gray-400 text-gray-700",
  lnpGreen: "bg-primary-100 border-primary-300 text-primary-600",
  yellow: "bg-yellow-100 border-yellow-300 text-yellow-600",
  orange: "bg-orange-100 border-orange-300 text-orange-500",
  red: "bg-red-100 border-red-300 text-red-500",
  green: "bg-green-100 border-green-300 text-green-500",
  indigo: "bg-indigo-100 border-indigo-300 text-indigo-500",
  violet: "bg-violet-200 border-violet-400 text-violet-600",
};

const SHAPE_CLASSES: Record<ChipShape, string> = {
  oval: "rounded-full",
  square: "rounded-[4px]",
};

const TEXT_SIZE_CLASSES: Record<ChipSize, string> = {
  s: "text-[10px] font-normal",
  m: "text-xs font-semibold",
  l: "text-xs font-semibold",
};

/** Figma — l 크기만 수직 패딩 4px, 나머지 2px */
const PADDING_L = "px-2 py-1";
const PADDING_DEFAULT = "px-2 py-0.5";

/** Figma onlyIcon 변형 — 고정 정사각 박스 */
const ONLY_ICON_BOX: Record<ChipSize, string> = {
  s: "size-[18px]",
  m: "size-[21px]",
  l: "size-[24px]",
};

const ICON_SIZE: Record<ChipSize, string> = {
  s: "size-3",
  m: "size-3",
  l: "size-4",
};

export function Chip({
  children,
  icon,
  onRemove,
  removeLabel,
  color = "gray",
  shape = "oval",
  size = "m",
  className,
}: ChipProps) {
  const onlyIcon = icon !== undefined && !children;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center gap-1 border-[0.5px] border-solid font-sans leading-normal tracking-[-0.03em] whitespace-nowrap",
        COLOR_CLASSES[color],
        SHAPE_CLASSES[shape],
        onlyIcon
          ? cn("p-0.5", ONLY_ICON_BOX[size])
          : cn(
              TEXT_SIZE_CLASSES[size],
              size === "l" ? PADDING_L : PADDING_DEFAULT,
            ),
        className,
      )}
    >
      {icon && <span className={cn(ICON_SIZE[size], "shrink-0")}>{icon}</span>}
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={
            removeLabel ??
            (typeof children === "string" ? `${children} 제거` : "제거")
          }
          className={cn(ICON_SIZE[size], "shrink-0 cursor-pointer")}
        >
          <XIcon />
        </button>
      )}
    </span>
  );
}
