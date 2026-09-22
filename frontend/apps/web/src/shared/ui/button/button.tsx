import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/src/shared/utils/cn";

/**
 * KAISA 버튼 — Figma 디자인 시스템 (node 19:12888) 기반.
 *
 * filled/outlined × 7색 × 4사이즈 × hover/disabled 스펙을 실제 Figma 노드로 확인해 반영.
 * iconOnly는 고정 정사각(l 56 / m 48 / s 32 / xs 26px), 라벨 버튼은 auto-width.
 */
export type ButtonColor =
  | "primary"
  | "secondary"
  | "black"
  | "gray"
  | "red"
  | "white"
  | "transparent";

export type ButtonSize = "xs" | "s" | "m" | "l";

export type ButtonVariant = "filled" | "outlined";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  color?: ButtonColor;
  size?: ButtonSize;
  /** 텍스트 왼쪽 아이콘 (svg 권장 — 래퍼가 크기를 강제한다) */
  leftIcon?: ReactNode;
  /** 텍스트 오른쪽 아이콘 */
  rightIcon?: ReactNode;
  /** 아이콘만 넣는 정사각 버튼 (Figma iconOnly 변형) — leftIcon 사용 */
  iconOnly?: boolean;
  fullWidth?: boolean;
}

const SIZE: Record<ButtonSize, string> = {
  l: "px-4 py-4 text-base gap-2 rounded-xl",
  m: "px-4 py-3 text-base gap-2 rounded-xl",
  s: "px-4 py-2 text-xs gap-1.5 rounded-lg",
  xs: "px-2 py-1 text-xs gap-1 rounded-lg",
};

const ICON_ONLY_SIZE: Record<ButtonSize, string> = {
  l: "size-14 rounded-xl",
  m: "size-12 rounded-xl",
  s: "size-8 rounded-lg",
  xs: "size-[26px] rounded-lg",
};

const ICON_SIZE: Record<ButtonSize, string> = {
  l: "size-5",
  m: "size-5",
  s: "size-4",
  xs: "size-4",
};

const FILLED: Record<ButtonColor, string> = {
  primary: "bg-primary-700 text-white hover:bg-primary-600",
  secondary: "bg-primary-50 text-primary-500 hover:bg-primary-100",
  black: "bg-gray-800 text-white hover:bg-gray-700",
  gray: "bg-gray-200 text-gray-500 hover:bg-gray-300",
  red: "bg-red-100 text-red-500 hover:bg-red-200",
  white: "bg-white text-gray-500 hover:bg-gray-100",
  transparent: "text-gray-500 hover:bg-gray-100",
};

const OUTLINED: Record<ButtonColor, string> = {
  primary: "border border-primary-400 text-primary-400 hover:bg-gray-50",
  secondary: "border border-primary-200 text-primary-400 hover:bg-gray-50",
  black: "border border-gray-900 text-gray-900 hover:bg-gray-50",
  gray: "border border-gray-300 text-gray-500 hover:bg-gray-50",
  red: "border border-red-200 text-red-500 hover:bg-gray-50",
  white: "border border-gray-300 text-gray-500 hover:bg-gray-50",
  transparent: "text-gray-500 hover:bg-gray-100",
};

const DISABLED_FILLED =
  "disabled:pointer-events-none disabled:bg-gray-300 disabled:text-white";

const DISABLED_OUTLINED =
  "disabled:pointer-events-none disabled:bg-white disabled:border-gray-200 disabled:text-gray-300";

export function Button({
  variant = "filled",
  color = "primary",
  size = "m",
  leftIcon,
  rightIcon,
  iconOnly = false,
  fullWidth = false,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center font-sans font-semibold leading-normal tracking-[-0.03em] whitespace-nowrap transition-[background-color,border-color,color] select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
        iconOnly ? ICON_ONLY_SIZE[size] : SIZE[size],
        variant === "filled" ? FILLED[color] : OUTLINED[color],
        variant === "filled" ? DISABLED_FILLED : DISABLED_OUTLINED,
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {iconOnly ? (
        <span className={cn("shrink-0 [&>svg]:size-full", ICON_SIZE[size])}>
          {leftIcon}
        </span>
      ) : (
        <>
          {leftIcon && (
            <span className={cn("shrink-0 [&>svg]:size-full", ICON_SIZE[size])}>
              {leftIcon}
            </span>
          )}
          {children}
          {rightIcon && (
            <span className={cn("shrink-0 [&>svg]:size-full", ICON_SIZE[size])}>
              {rightIcon}
            </span>
          )}
        </>
      )}
    </button>
  );
}
