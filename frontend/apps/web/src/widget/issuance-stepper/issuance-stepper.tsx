import { Fragment } from "react";

import { cn } from "@/src/shared/utils/cn";

/** 발급 플로우 단계 — 신청 내용 확인 → 결제 → 발급 완료 */
const STEPS = ["신청 내용 확인", "결제", "발급 완료"] as const;

export interface IssuanceStepperProps {
  /** 현재 단계 (1부터). 완료한 단계까지 primary로 채운다 */
  currentStep?: number;
  className?: string;
}

/**
 * 발급 플로우 스테퍼 — Figma 노드 37:26383 기반.
 *
 * 24px 원형 뱃지(완료=primary-700, 예정=gray-200) + 라벨(14px), › 구분자.
 * 발급 결제(38:2281)·발급 완료(37:26383) 화면이 공유해 widget 레이어에 둔다.
 */
export function IssuanceStepper({
  currentStep = STEPS.length,
  className,
}: IssuanceStepperProps) {
  return (
    <ol className={cn("flex items-center gap-3 font-sans", className)}>
      {STEPS.map((label, index) => {
        const step = index + 1;
        const isDone = step <= currentStep;
        return (
          <Fragment key={label}>
            {index > 0 && (
              <li aria-hidden className="shrink-0 text-base leading-normal text-gray-300">
                ›
              </li>
            )}
            <li className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs font-semibold leading-normal",
                  isDone ? "bg-primary-700 text-white" : "bg-gray-200 text-gray-500",
                )}
              >
                {step}
              </span>
              <span
                className={cn(
                  "text-sm leading-normal whitespace-nowrap",
                  isDone
                    ? "font-semibold text-gray-900"
                    : "font-medium text-gray-500",
                )}
              >
                {label}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
