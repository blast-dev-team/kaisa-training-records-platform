import { cn } from "@/src/shared/utils/cn";

export type ProgressBarSize = "l" | "m" | "s";

export interface ProgressBarProps {
  /** 진행률 0~100 — 퍼센트 라벨과 채움 폭에 쓰인다 */
  value: number;
  size?: ProgressBarSize;
  /** 좌측 퍼센트 라벨 표시 (Figma leftText) */
  leftText?: boolean;
  /** 우측 퍼센트 라벨 표시 (Figma rightText) */
  rightText?: boolean;
  className?: string;
}

const TRACK_HEIGHT: Record<ProgressBarSize, string> = {
  l: "h-3",
  m: "h-2",
  s: "h-1",
};

const LABEL_SIZE: Record<ProgressBarSize, string> = {
  l: "w-8 text-sm",
  m: "w-[26px] text-xs",
  s: "w-[22px] text-[10px]",
};

/**
 * 진행률 바 — gray-200 트랙 + primary-700 채움. 트랙 높이는 size(l 12/m 8/s 4px),
 * 퍼센트 라벨은 leftText/rightText로 좌우에 각각 붙인다.
 */
export function ProgressBar({
  value,
  size = "l",
  leftText = false,
  rightText = false,
  className,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const label = (
    <span
      className={cn(
        "shrink-0 font-sans font-semibold leading-[1.5] tracking-[-0.03em] text-gray-500",
        LABEL_SIZE[size],
      )}
    >
      {Math.round(clamped)}%
    </span>
  );

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("flex w-[335px] items-center gap-3", className)}
    >
      {leftText && label}
      <div
        aria-hidden="true"
        className={cn(
          "min-w-px flex-1 rounded-full bg-gray-200",
          TRACK_HEIGHT[size],
        )}
      >
        <div
          className={cn("h-full rounded-full bg-primary-700")}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {rightText && label}
    </div>
  );
}
