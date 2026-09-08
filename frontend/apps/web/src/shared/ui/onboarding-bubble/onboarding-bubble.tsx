import { XIcon } from "@/src/shared/icon";
import { cn } from "@/src/shared/utils/cn";

/**
 * KAISA 온보딩 버블 — Figma 디자인 시스템 (node 19:18981) 기준.
 *
 * 제목 + 설명 + 단계 내비게이션으로 구성된 안내 카드.
 * 4방향 변형 모두 꼬리(포인터) 없는 동일 카드라 방향 prop은 없다.
 * - 카드: 320px 고정폭, white 배경, 12px radius (그림자·테두리 없음)
 * - 헤더: 16px SemiBold 제목 + 26px 닫기 버튼 (X 아이콘)
 * - 푸터: "N / M" 단계 표기 + 이전/다음 버튼 (gray-300 outline)
 */
export interface OnboardingBubbleProps {
  /** 제목 (Figma 기본값: "온보딩 제목") */
  title?: string;
  /** 설명 본문 (Figma 기본값 사용) */
  description?: string;
  /** 현재 단계 (1부터) */
  step: number;
  /** 전체 단계 수 */
  totalSteps: number;
  /** 닫기 버튼 클릭 */
  onClose?: () => void;
  /** "이전" 버튼 클릭 */
  onPrev?: () => void;
  /** "다음" 버튼 클릭 */
  onNext?: () => void;
  className?: string;
}

export function OnboardingBubble({
  title = "온보딩 제목",
  description = "온보딩에 대한 내용입니다. 온보딩에 대한 내용입니다. 온보딩에 대한 내용입니다.",
  step,
  totalSteps,
  onClose,
  onPrev,
  onNext,
  className,
}: OnboardingBubbleProps) {
  return (
    <div
      className={cn(
        "flex w-[320px] flex-col gap-3 rounded-xl bg-white px-4 py-3 font-sans",
        className,
      )}
    >
      {/* 헤더 — 제목 + 닫기 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-base leading-normal font-semibold tracking-[-0.03em] text-gray-900">
          {title}
        </p>
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="size-[26px] shrink-0 cursor-pointer rounded-lg p-1 text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          <XIcon />
        </button>
      </div>

      {/* 설명 */}
      <p className="text-sm leading-normal tracking-[-0.03em] text-gray-500">
        {description}
      </p>

      {/* 푸터 — 단계 표기 + 이전/다음 */}
      <div className="flex items-center justify-between">
        <p className="text-sm leading-normal tracking-[-0.03em] text-gray-500">
          {step} / {totalSteps}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            className="cursor-pointer rounded-lg border border-solid border-gray-300 bg-white px-2 py-1 text-xs leading-normal font-semibold tracking-[-0.03em] whitespace-nowrap text-gray-500 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            이전
          </button>
          <button
            type="button"
            onClick={onNext}
            className="cursor-pointer rounded-lg border border-solid border-gray-300 bg-white px-2 py-1 text-xs leading-normal font-semibold tracking-[-0.03em] whitespace-nowrap text-gray-500 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
}
