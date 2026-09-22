import type { ReactNode } from "react";

import { cn } from "@/src/shared/utils/cn";

import type { TableSize } from "./table";

export type TableCellType =
  | "text"
  | "checkbox"
  | "radio"
  | "badge"
  | "button"
  | "dropdown";

export interface TableCellProps {
  /** 셀 내용 — Checkbox·Radio·Chip·Button·Dropdown 등 공용 컴포넌트를 조합해 넣는다 */
  children?: ReactNode;
  /** 열 폭·정렬 결정 — text 100px 좌측, checkbox 43/35px·radio·badge·button 100px 중앙, dropdown 160px */
  type?: TableCellType;
  /** l 셀 56px / m 셀 28px */
  size?: TableSize;
  className?: string;
}

const HEIGHT: Record<TableSize, string> = {
  l: "h-14 px-3",
  m: "h-7 px-2",
};

/** checkbox 열 폭 — 좌우 패딩 + 18px 체크박스 + 우측 border 1px */
const CHECKBOX_WIDTH: Record<TableSize, string> = {
  l: "w-[43px]",
  m: "w-[35px]",
};

const TYPE_WIDTH: Partial<Record<TableCellType, string>> = {
  dropdown: "w-[160px]",
};

/**
 * 표 본문 셀 — white 배경 + Regular 12px gray-600, border-r/b gray-200.
 * 내용물은 children으로 조합한다 (예: `<TableCell type="checkbox"><Checkbox size="s" /></TableCell>`).
 */
export function TableCell({
  children,
  type = "text",
  size = "l",
  className,
}: TableCellProps) {
  const centered =
    type === "checkbox" || type === "radio" || type === "badge" || type === "button";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center border-r border-b border-solid border-gray-200 bg-white",
        HEIGHT[size],
        type === "checkbox" ? CHECKBOX_WIDTH[size] : (TYPE_WIDTH[type] ?? "w-[100px]"),
        centered && "justify-center",
        className,
      )}
    >
      {type === "text" ? (
        <p className="min-w-px flex-1 font-sans text-xs leading-[1.5] tracking-[-0.03em] text-gray-600">
          {children}
        </p>
      ) : (
        children
      )}
    </div>
  );
}
