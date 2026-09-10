import type { ReactNode } from "react";

import { cn } from "@/src/shared/utils/cn";

export type TableSize = "l" | "m";

export interface TableProps {
  children: ReactNode;
  className?: string;
}

/**
 * 표 컨테이너 — rounded-xl + dropShadow. 셀 border-r/b 조합으로 눈금을 만들며
 * 모서리는 overflow-hidden으로 둥글게 잘린다 (Figma node 19:17689).
 *
 * ```
 * <Table>
 *   <TableRow>
 *     <TableHeader type="checkbox" />
 *     <TableHeader text="제목" sort sortingType="down" onSort={...} />
 *   </TableRow>
 *   <TableRow>
 *     <TableCell type="checkbox"><Checkbox size="s" /></TableCell>
 *     <TableCell>text</TableCell>
 *   </TableRow>
 * </Table>
 * ```
 */
export function Table({ children, className }: TableProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-xl shadow-[0_2px_4px_0_rgba(16,24,40,0.1)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface TableRowProps {
  children: ReactNode;
  className?: string;
}

/** 표 한 행 — 헤더 행/본문 행 공용. 셀들을 가로로 나열한다. */
export function TableRow({ children, className }: TableRowProps) {
  return (
    <div className={cn("flex w-full items-center", className)}>{children}</div>
  );
}
