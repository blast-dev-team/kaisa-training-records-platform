import '@tanstack/react-table'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type RowData,
} from '@tanstack/react-table'
import { useState } from 'react'
import { Pagination } from './pagination'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    width?: number
    align?: 'left' | 'center' | 'right'
    /** 'right' 면 가로 스크롤 시에도 컬럼을 우측에 고정(액션 버튼이 좁은 화면에서 가려지지 않게). */
    sticky?: 'right'
  }
}

// 컬럼 사이 절반 높이 세로 구분선(가운데) — columnDividers 옵션. td 가 nowrap 이라 pseudo 로 처리.
const COL_DIVIDER =
  "relative after:content-[''] after:absolute after:right-0 after:top-1/4 after:h-1/2 after:w-px after:bg-line"

interface AppTableProps<TData extends RowData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  isLoading?: boolean
  emptyMessage?: string
  onRowClick?: (row: TData) => void
  /** 컬럼 사이 세로 구분선(절반 높이, 가운데) — 컬럼 많은 테이블 가독성용 */
  columnDividers?: boolean
  /** 셀 패딩 축소(px-2.5 py-2) — 너비 확보가 중요한 와이드 테이블용 */
  dense?: boolean
  page?: number
  totalPages?: number
  onPageChange?: (page: number) => void
  paginationInfo?: string
  /**
   * 정렬을 **서버가** 한다 — 부모가 상태를 들고 있을 때만 준다.
   *
   * 주지 않으면 테이블이 스스로 정렬한다(클라이언트 정렬).
   * 서버 페이지네이션과 클라이언트 정렬을 같이 쓰면 보고 있는 페이지 안에서만
   * 줄이 서서, 사용자는 전체가 정렬된 줄 알고 본다.
   */
  sorting?: SortingState
  onSortingChange?: (next: SortingState) => void
}

function TableFooter({
  page,
  totalPages,
  onPageChange,
  info,
}: {
  page: number
  totalPages: number
  onPageChange: (p: number) => void
  info?: string
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-line gap-3">
      {info && <span className="text-[11px] text-ink-3">{info}</span>}
      <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  )
}

export function AppTable<TData extends RowData>({
  columns,
  data,
  isLoading,
  emptyMessage = '데이터가 없습니다',
  onRowClick,
  columnDividers,
  dense,
  page,
  totalPages,
  onPageChange,
  paginationInfo,
  sorting,
  onSortingChange,
}: AppTableProps<TData>) {
  const cellPad = dense ? 'px-2.5 py-2' : 'px-4 py-3'
  const [localSorting, setLocalSorting] = useState<SortingState>([])
  // 부모가 정렬을 들고 있으면 서버 정렬 — 테이블이 행을 다시 줄 세우지 않는다
  const serverSorted = sorting !== undefined
  const sortingState = sorting ?? localSorting

  const table = useReactTable({
    data,
    columns,
    state: { sorting: sortingState },
    onSortingChange: updater => {
      const next = typeof updater === 'function' ? updater(sortingState) : updater
      if (serverSorted) onSortingChange?.(next)
      else setLocalSorting(next)
    },
    manualSorting: serverSorted,
    getCoreRowModel: getCoreRowModel(),
    ...(serverSorted ? {} : { getSortedRowModel: getSortedRowModel() }),
  })

  const hasPagination = page !== undefined && totalPages !== undefined && onPageChange !== undefined

  // sticky:'right' 컬럼들의 right offset(px) 계산 — 우측부터 누적(여러 컬럼 고정 지원).
  // 고정 컬럼은 meta.width 필수(offset 계산용). 없으면 0.
  const stickyRightOffset: Record<string, number> = {}
  {
    let acc = 0
    const leaf = table.getVisibleLeafColumns()
    for (let i = leaf.length - 1; i >= 0; i--) {
      const c = leaf[i]
      if (c?.columnDef.meta?.sticky === 'right') {
        stickyRightOffset[c.id] = acc
        acc += typeof c.columnDef.meta?.width === 'number' ? c.columnDef.meta.width : 0
      }
    }
  }

  return (
    <div className="rounded-lg border border-line bg-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="border-b border-line bg-panel-2">
                {hg.headers.map((header, idx) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  const align = header.column.columnDef.meta?.align
                  const sticky = header.column.columnDef.meta?.sticky === 'right'
                  const nextSticky = hg.headers[idx + 1]?.column.columnDef.meta?.sticky === 'right'
                  // 고정 컬럼은 border-l 로 구분 → 자신/바로 왼쪽 셀엔 COL_DIVIDER 미적용(이중선 방지)
                  const divider = columnDividers && idx < hg.headers.length - 1 && !sticky && !nextSticky
                  return (
                    <th
                      key={header.id}
                      className={`${cellPad} text-[12px] font-medium text-ink-3 whitespace-nowrap select-none ${
                        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                      } ${canSort ? 'cursor-pointer hover:text-ink' : ''} ${divider ? COL_DIVIDER : ''} ${
                        sticky ? 'sticky z-[2] bg-panel-2 border-l border-line' : ''
                      }`}
                      style={{
                        ...(header.column.columnDef.meta?.width ? { width: header.column.columnDef.meta.width } : {}),
                        ...(sticky ? { right: stickyRightOffset[header.column.id] ?? 0 } : {}),
                      }}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className="text-[10px]">
                            {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '↕'}
                          </span>
                        )}
                      </span>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-ink-3">
                  불러오는 중...
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-ink-3">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={`group transition-colors border-b border-line-2 last:border-0 ${
                    onRowClick ? 'cursor-pointer ' : ''
                  }hover:bg-panel-2`}
                >
                  {row.getVisibleCells().map((cell, idx, arr) => {
                    const align = cell.column.columnDef.meta?.align
                    const sticky = cell.column.columnDef.meta?.sticky === 'right'
                    const nextSticky = arr[idx + 1]?.column.columnDef.meta?.sticky === 'right'
                    const divider = columnDividers && idx < arr.length - 1 && !sticky && !nextSticky
                    return (
                      <td
                        key={cell.id}
                        className={`${cellPad} whitespace-nowrap ${
                          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''
                        } ${divider ? COL_DIVIDER : ''} ${
                          sticky ? 'sticky z-[1] bg-inherit group-hover:bg-panel-2 border-l border-line' : ''
                        }`}
                        style={sticky ? { right: stickyRightOffset[cell.column.id] ?? 0 } : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasPagination && (
        <TableFooter
          page={page!}
          totalPages={totalPages!}
          onPageChange={onPageChange!}
          info={paginationInfo}
        />
      )}
    </div>
  )
}
