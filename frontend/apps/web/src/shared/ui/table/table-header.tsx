import type { KeyboardEvent } from "react";

import {
  CaretDown16Icon,
  CaretUp16Icon,
  CaretUpDownIcon,
} from "@/src/shared/icon";
import { cn } from "@/src/shared/utils/cn";

import type { TableSize } from "./table";

export type TableHeaderType = "text" | "checkbox";
export type TableSortDirection = "off" | "up" | "down";

export interface TableHeaderProps {
  /** 헤더 텍스트 — type="text"일 때 표시 */
  text?: string;
  /** text(기본) | checkbox — checkbox면 체크박스 자리(43px)를 차지한다 */
  type?: TableHeaderType;
  /** l 헤더 48px / m 헤더 28px */
  size?: TableSize;
  /** 정렬 가능 헤더 — 캐럿 표시 + onSort 클릭 활성 */
  sort?: boolean;
  /** 현재 정렬 방향 — off면 위아래 캐럿(gray-300), up/down이면 해당 캐럿(gray-600) */
  sortingType?: TableSortDirection;
  /** 정렬 헤더 클릭 핸들러 */
  onSort?: () => void;
  className?: string;
}

const HEIGHT: Record<TableSize, string> = {
  l: "h-12 px-3",
  m: "h-7 px-2",
};

/** checkbox 열 폭 — 좌우 패딩 + 18px 체크박스 + 우측 border 1px */
const CHECKBOX_WIDTH: Record<TableSize, string> = {
  l: "w-[43px]",
  m: "w-[35px]",
};

const SORT_ICON: Record<TableSortDirection, string> = {
  off: "text-gray-300",
  up: "text-gray-600",
  down: "text-gray-600",
};

/**
 * 표 헤더 셀 — gray-100 배경 + SemiBold 12px gray-600.
 * type="checkbox"면 children 없이 체크박스 폭만 확보(내용은 사용자가 children으로 조합).
 */
export function TableHeader({
  text,
  type = "text",
  size = "l",
  sort = false,
  sortingType = "off",
  onSort,
  className,
}: TableHeaderProps) {
  const sortable = sort && onSort !== undefined;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSort?.();
    }
  };

  return (
    <div
      role={sortable ? "button" : undefined}
      tabIndex={sortable ? 0 : undefined}
      onClick={sortable ? onSort : undefined}
      onKeyDown={sortable ? handleKeyDown : undefined}
      className={cn(
        "flex shrink-0 items-center border-r border-b border-solid border-gray-200 bg-gray-100",
        HEIGHT[size],
        type === "checkbox" ? cn("justify-center", CHECKBOX_WIDTH[size]) : "w-[100px]",
        type === "text" && sort && "gap-2.5",
        sortable && "cursor-pointer select-none",
        className,
      )}
    >
      {type === "text" && (
        <>
          <p className="min-w-px flex-1 font-sans text-xs font-semibold leading-[1.5] tracking-[-0.03em] text-gray-600">
            {text}
          </p>
          {sort && (
            <span
              aria-hidden="true"
              className={cn("size-4 shrink-0", SORT_ICON[sortingType])}
            >
              {sortingType === "up" ? (
                <CaretUp16Icon />
              ) : sortingType === "down" ? (
                <CaretDown16Icon />
              ) : (
                <CaretUpDownIcon />
              )}
            </span>
          )}
        </>
      )}
      {type === "checkbox" && (
        <span className="size-[18px] shrink-0" aria-hidden="true" />
      )}
    </div>
  );
}
