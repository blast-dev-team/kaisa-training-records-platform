import type { InputHTMLAttributes } from "react";

import { cn } from "@/src/shared/utils/cn";

/**
 * KAISA 토글 스위치 — Figma 디자인 시스템 (node 19:18059) 기반.
 *
 * size(l/m/s) × state(on/off) × state(active/disabled) 변형 매트릭스를
 * 실제 Figma 노드(SVG)로 확인해 반영.
 * - 트랙: 완전히 둥근 pill (l 48×28 / m 40×24 / s 32×20), 노브 2px inset
 *   on primary-700 · off gray-300 · on+disabled gray-400 · off+disabled gray-100
 * - 노브: 흰색 원 (l 24 / m 20 / s 16), on+disabled만 gray-200
 *   (off+disabled 노브 #FDFDFD ≈ white로 처리)
 * - on/off 상태는 네이티브 input(:checked/:disabled) 기반이라 제어·비제어 모두 지원
 */
export type ToggleSwitchSize = "l" | "m" | "s";

export interface ToggleSwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  size?: ToggleSwitchSize;
}

const TRACK_SIZE: Record<ToggleSwitchSize, string> = {
  l: "h-7 w-12",
  m: "h-6 w-10",
  s: "h-5 w-8",
};

const KNOB_SIZE: Record<ToggleSwitchSize, string> = {
  l: "size-6",
  m: "size-5",
  s: "size-4",
};

/** on 위치 이동거리 = 트랙 폭 − 노브 − inset 4px */
const KNOB_SHIFT: Record<ToggleSwitchSize, string> = {
  l: "group-checked:translate-x-[22px]",
  m: "group-checked:translate-x-[18px]",
  s: "group-checked:translate-x-[14px]",
};

export function ToggleSwitch({
  size = "m",
  className,
  disabled,
  ...props
}: ToggleSwitchProps) {
  return (
    <label
      className={cn(
        "inline-block font-sans",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        className,
      )}
    >
      <input
        type="checkbox"
        role="switch"
        disabled={disabled}
        className="group sr-only"
        {...props}
      />
      <span
        className={cn(
          "relative inline-flex items-center rounded-full transition-[background-color]",
          TRACK_SIZE[size],
          "bg-gray-300 group-checked:bg-primary-700",
          "group-disabled:bg-gray-100 group-checked:group-disabled:bg-gray-400",
          "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary-400",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 rounded-full bg-white transition-transform",
            KNOB_SIZE[size],
            KNOB_SHIFT[size],
            "group-checked:group-disabled:bg-gray-200",
          )}
        />
      </span>
    </label>
  );
}
