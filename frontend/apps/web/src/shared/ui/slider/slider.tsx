import { useState } from "react";
import { cn } from "@/src/shared/utils/cn";

export type SliderLevel = 1 | 2 | 3;

export interface SliderProps {
  /** 현재 단계 — 지정 시 제어 모드 */
  level?: SliderLevel;
  defaultLevel?: SliderLevel;
  onLevelChange?: (level: SliderLevel) => void;
  /** 트랙 위 좌측 라벨 (Figma text=on) */
  leftText?: string;
  /** 트랙 위 우측 라벨 */
  rightText?: string;
  /** 활성 핸들 포커스 시 뜨는 값 말풍선 텍스트 */
  valueText?: string;
  className?: string;
}

const STOPS: SliderLevel[] = [1, 2, 3];

/**
 * 3단계 슬라이더 — 스톱 3개와 스톱 사이 채움 세그먼트로 구성.
 * 활성 핸들은 흰 원 + shadow, 포커스 시 primary-400 링과 값 말풍선이 뜬다.
 */
export function Slider({
  level,
  defaultLevel = 1,
  onLevelChange,
  leftText,
  rightText,
  valueText,
  className,
}: SliderProps) {
  const [innerLevel, setInnerLevel] = useState<SliderLevel>(defaultLevel);
  const current = level ?? innerLevel;

  const select = (stop: SliderLevel) => {
    setInnerLevel(stop);
    onLevelChange?.(stop);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {(leftText !== undefined || rightText !== undefined) && (
        <div className="flex w-full items-center justify-between text-sm leading-[1.5] tracking-[-0.03em] text-gray-500">
          <span>{leftText}</span>
          <span>{rightText}</span>
        </div>
      )}
      <div
        role="radiogroup"
        aria-label="단계 선택"
        className="flex w-[311px] items-center"
      >
        {STOPS.map((stop, index) => {
          const isActive = stop === current;
          return (
            <div key={stop} className="flex items-center">
              {index > 0 && (
                <div
                  aria-hidden="true"
                  className={cn(
                    "h-2.5 flex-1 rounded-full",
                    stop - 1 < current ? "bg-primary-700" : "bg-gray-100",
                  )}
                />
              )}
              <button
                type="button"
                role="radio"
                aria-checked={isActive}
                aria-label={`${stop}단계`}
                onClick={() => select(stop)}
                className="group flex size-5 shrink-0 cursor-pointer items-center justify-center"
              >
                {isActive ? (
                  <span className="relative flex items-center justify-center">
                    <span className="size-5 rounded-full bg-white shadow-[0_4px_12px_0_rgba(16,24,40,0.1)] group-focus-visible:outline group-focus-visible:outline-1 group-focus-visible:outline-primary-400" />
                    {valueText !== undefined && (
                      <span className="pointer-events-none absolute bottom-full left-1/2 mb-2.5 hidden -translate-x-1/2 rounded-[4px] bg-primary-100 px-1 text-xs leading-[1.5] tracking-[-0.03em] whitespace-nowrap text-gray-900 group-focus-visible:block">
                        {valueText}
                      </span>
                    )}
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 rounded-full",
                      stop < current ? "bg-white" : "bg-gray-300",
                    )}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
