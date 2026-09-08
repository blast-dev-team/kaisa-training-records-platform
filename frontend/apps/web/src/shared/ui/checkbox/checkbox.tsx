import type { InputHTMLAttributes, ReactNode } from "react";

import { CheckSmIcon } from "@/src/shared/icon";
import { cn } from "@/src/shared/utils/cn";

/**
 * KAISA 체크박스 — Figma 디자인 시스템 (node 19:17986) 기반.
 *
 * outline(카드형) × selected × text × size(m/s) × state(active/disabled)
 * 변형 매트릭스를 실제 Figma 노드로 확인해 반영.
 * - 박스: 4px radius 정사각 (m 24px / s 18px)
 *   미선택 white+gray-300 border · 미선택+disabled gray-200 배경
 *   선택 primary-700 · 선택+disabled gray-600
 * - 체크 아이콘: 16px 흰색 (node 8:50)
 * - 선택 상태는 네이티브 input(:checked/:disabled) 기반이라 제어·비제어 모두 지원
 */
export type CheckboxSize = "m" | "s";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** 라벨 텍스트 — 생략 시 인디케이터만 렌더링 (Figma text=off) */
  children?: ReactNode;
  /** 카드형 외곽선 변형 (Figma outline=on) */
  outline?: boolean;
  size?: CheckboxSize;
}

const BOX_SIZE: Record<CheckboxSize, string> = {
  m: "size-6",
  s: "size-[18px]",
};

const GAP: Record<CheckboxSize, string> = {
  m: "gap-2.5",
  s: "gap-1.5",
};

const TEXT_SIZE: Record<CheckboxSize, string> = {
  m: "text-base",
  s: "text-xs",
};

/** Figma outline 카드 — m 12px radius·16/12 padding, s 8px radius·8 padding */
const OUTLINE_SIZE: Record<CheckboxSize, string> = {
  m: "w-[335px] rounded-xl px-4 py-3",
  s: "w-[335px] rounded-lg p-2",
};

export function Checkbox({
  children,
  outline = false,
  size = "m",
  className,
  disabled,
  ...props
}: CheckboxProps) {
  return (
    <label
      className={cn(
        "inline-flex items-start font-sans",
        GAP[size],
        outline &&
          cn(
            "border border-solid border-gray-300 bg-white",
            "has-checked:border-primary-400 has-checked:has-disabled:border-gray-600",
            OUTLINE_SIZE[size],
          ),
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        className,
      )}
    >
      <input
        type="checkbox"
        disabled={disabled}
        className="group sr-only"
        {...props}
      />
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[4px] border border-solid border-gray-300 bg-white",
          BOX_SIZE[size],
          "group-checked:border-primary-700 group-checked:bg-primary-700",
          "group-disabled:bg-gray-200",
          "group-checked:group-disabled:border-gray-600 group-checked:group-disabled:bg-gray-600",
          "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary-400",
        )}
      >
        <span className="hidden size-4 text-white group-checked:block">
          <CheckSmIcon />
        </span>
      </span>
      {children !== undefined && (
        <span
          className={cn(
            "leading-[1.5] tracking-[-0.03em] text-gray-800",
            TEXT_SIZE[size],
            "group-disabled:text-gray-300 group-checked:group-disabled:text-gray-400",
          )}
        >
          {children}
        </span>
      )}
    </label>
  );
}
