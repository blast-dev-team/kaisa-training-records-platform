import { cn } from "@/src/shared/utils/cn";

export type IndicatorOrder = 1 | 2 | 3 | 4 | 5;

export interface IndicatorProps {
  /** 현재 단계 — 도트 5개 중 활성 위치 */
  order: IndicatorOrder;
  className?: string;
}

const TOTAL_STEPS = 5;

/** 단계 인디케이터 — 표시 전용(상호작용 없음). 활성 도트는 primary-400 + white 테두리. */
export function Indicator({ order, className }: IndicatorProps) {
  return (
    <div
      role="img"
      aria-label={`5단계 중 ${order}단계`}
      className={cn("flex items-center gap-2", className)}
    >
      {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((step) => (
        <span
          key={step}
          className={
            step === order
              ? "size-[11px] rounded-full border border-solid border-white bg-primary-400"
              : "size-2 rounded-full bg-gray-200"
          }
        />
      ))}
    </div>
  );
}
