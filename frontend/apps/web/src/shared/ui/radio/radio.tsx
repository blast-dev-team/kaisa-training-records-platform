import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/src/shared/utils/cn";

/**
 * KAISA 라디오 — Figma 디자인 시스템 (node 19:17897) 기반.
 *
 * outline(카드형) × selected × text × size(m/s) × state(active/disabled)
 * 변형 매트릭스를 실제 Figma 노드로 확인해 반영.
 * - 인디케이터: 채워진 원 (m 22px 박스·도트 14 / s 18px 박스·도트 10)
 *   미선택 gray-300 · 선택 primary-700 · 선택+disabled gray-500
 * - 선택 상태는 네이티브 input(:checked/:disabled) 기반이라 제어·비제어 모두 지원
 */
export type RadioSize = "m" | "s";

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** 라벨 텍스트 — 생략 시 인디케이터만 렌더링 (Figma text=off) */
  children?: ReactNode;
  /** 카드형 외곽선 변형 (Figma outline=on) */
  outline?: boolean;
  size?: RadioSize;
}

const INDICATOR_SIZE: Record<RadioSize, string> = {
  m: "size-[22px]",
  s: "size-[18px]",
};

const DOT_SIZE: Record<RadioSize, string> = {
  m: "size-[14px]",
  s: "size-[10px]",
};

const GAP: Record<RadioSize, string> = {
  m: "gap-2",
  s: "gap-1.5",
};

const TEXT_SIZE: Record<RadioSize, string> = {
  m: "text-base",
  s: "text-xs",
};

/** Figma outline 카드 — m 12px radius·16/12 padding, s 8px radius·8 padding */
const OUTLINE_SIZE: Record<RadioSize, string> = {
  m: "w-[335px] rounded-xl px-4 py-3",
  s: "w-[335px] rounded-lg p-2",
};

export function Radio({
  children,
  outline = false,
  size = "m",
  className,
  disabled,
  ...props
}: RadioProps) {
  return (
    <label
      className={cn(
        // group 클래스 추가 (하위 input 상태 감지용)
        "group inline-flex items-start font-sans",
        GAP[size],
        outline &&
          cn(
            "border border-solid border-gray-300 bg-white",
            "group-has-[:checked]:border-primary-400 group-has-[:checked]:group-has-[:disabled]:border-gray-600",
            OUTLINE_SIZE[size],
          ),
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        className,
      )}
    >
      <input
        type="radio"
        disabled={disabled}
        className="sr-only" // peer 제거 가능
        {...props}
      />
      <span
        className={cn(
          "flex shrink-0 items-center justify-center",
          INDICATOR_SIZE[size],
          "group-focus-within:outline-2 group-focus-within:outline-offset-2 group-focus-within:outline-primary-400",
        )}
      >
        <span
          className={cn(
            "rounded-full bg-gray-300",
            DOT_SIZE[size],
            // group-has-[:checked] 사용
            "group-has-[:checked]:bg-primary-700 group-has-[:checked]:group-has-[:disabled]:bg-gray-500",
          )}
        />
      </span>
      {children !== undefined && (
        <span
          className={cn(
            "leading-[1.5] tracking-[-0.03em] text-gray-800",
            TEXT_SIZE[size],
            "group-has-[:disabled]:text-gray-300 group-has-[:checked]:group-has-[:disabled]:text-gray-400",
          )}
        >
          {children}
        </span>
      )}
    </label>
  );
}
