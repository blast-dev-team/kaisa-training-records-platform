import type { ReactNode } from "react";

import { InfoIcon } from "@/src/shared/icon";
import { cn } from "@/src/shared/utils/cn";

/**
 * KAISA 툴팁 — Figma 디자인 시스템 (node 19:17739) 기준.
 *
 * 24px Info 아이콘 트리거에 hover/focus 시 말풍선이 뜨는 인라인 툴팁.
 * - 말풍선: 240px 고정폭, gray-200 배경, 8px radius, dropShadow/xs
 * - 방향 4종 — 말풍선 모서리가 트리거의 반대편 모서리에 맞닿는다
 *   (topLeft = 말풍선 우하단 ⇄ 트리거 좌상단). 고정 px 오프셋 대신
 *   top/bottom-full 앵커를 써 내용 길이와 무관하게 정렬 유지
 * - children 전달 시 기본 Info 트리거를 대체한다 (호출부 요소에 그대로 붙임)
 */
export type TooltipDirection = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export interface TooltipProps {
  /** 말풍선 본문 */
  description: string;
  /** 말풍선 위치 (Figma 기본값: topLeft) */
  direction?: TooltipDirection;
  /** 트리거 대체 — 생략 시 24px Info 아이콘 버튼 */
  children?: ReactNode;
  className?: string;
}

const POSITION: Record<TooltipDirection, string> = {
  topLeft: "bottom-full right-full",
  topRight: "bottom-full left-full",
  bottomLeft: "top-full right-full",
  bottomRight: "top-full left-full",
};

export function Tooltip({
  description,
  direction = "topLeft",
  children,
  className,
}: TooltipProps) {
  return (
    <span className={cn("group relative inline-flex font-sans", className)}>
      {children ?? (
        <button
          type="button"
          aria-label="정보 보기"
          className="size-6 cursor-pointer text-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          <InfoIcon />
        </button>
      )}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute w-[240px] rounded-lg bg-gray-200 px-3 py-2 opacity-0 drop-shadow-[0_2px_4px_rgba(16,24,40,0.1)] transition-opacity duration-150 invisible",
          "group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100",
          POSITION[direction],
        )}
      >
        <p className="text-[10px] leading-normal tracking-[-0.03em] break-words text-black">
          {description}
        </p>
      </span>
    </span>
  );
}
