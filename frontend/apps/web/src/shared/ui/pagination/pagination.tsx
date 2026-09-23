import {
  CaretLeftIcon,
  CaretLineLeftIcon,
  CaretLineRightIcon,
  CaretRightIcon,
} from "@/src/shared/icon";
import { cn } from "@/src/shared/utils/cn";
import { Dropdown, type DropdownOption } from "../dropdown/dropdown";

export interface PaginationProps {
  /** 현재 페이지 — 1부터 시작 */
  page: number;
  totalPages: number;
  onChange?: (page: number) => void;
  /** 목록 수 옵션 — 지정 시 좌측 "N개씩 보기" 셀렉터 표시 (Figma numberOfList 변형) */
  limitOptions?: number[];
  limit?: number;
  onLimitChange?: (limit: number) => void;
  className?: string;
}

const PAGE_BUTTON_BASE =
  "flex size-8 cursor-pointer items-center justify-center font-sans text-sm leading-[1.4] tracking-[-0.03em]";
const PAGE_ACTIVE = "rounded-lg bg-primary-700 text-white";
const PAGE_INACTIVE = "text-gray-400";
const CARET_BUTTON =
  "flex size-6 cursor-pointer items-center justify-center text-gray-700 disabled:cursor-not-allowed disabled:text-gray-300";
const ELLIPSIS =
  "flex size-8 items-center justify-center font-sans text-sm leading-[1.4] text-gray-400";

/** 축약 시 항상 보여 줄 숫자 개수 (첫·현재±1·마지막) — 이하면 전체 노출 */
const MAX_VISIBLE = 5;

/** 페이지 숫자 목록 아이템 — 줄임표 위치는 문자열로 구분 */
type PageItem = number | "ellipsis-left" | "ellipsis-right";

/**
 * 노출할 페이지 아이템 — 첫·마지막 페이지와 현재 ±1은 항상 보이고
 * 그 사이 간격은 줄임표로 묶는다 (1 … 4 5 6 … 20). 5페이지 이하면 전체 노출.
 */
function buildPageItems(page: number, total: number): PageItem[] {
  if (total <= MAX_VISIBLE) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const items: PageItem[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) items.push("ellipsis-left");
  for (let number = start; number <= end; number++) items.push(number);
  if (end < total - 1) items.push("ellipsis-right");
  items.push(total);
  return items;
}

/**
 * 페이지네이션 — 캐럿 4종(첫/이전/다음/마지막) + 숫자 버튼.
 * limitOptions 지정 시 좌측 목록 수 셀렉터(Dropdown s)와 우측 스페이서로
 * 양 끝을 맞춘 numberOfList 변형(w-[736px])이 된다.
 */
export function Pagination({
  page,
  totalPages,
  onChange,
  limitOptions,
  limit,
  onLimitChange,
  className,
}: PaginationProps) {
  const hasLimit = limitOptions !== undefined && limitOptions.length > 0;
  const currentLimit = limit ?? limitOptions?.[0] ?? 10;
  const limitDropdownOptions: DropdownOption[] = (limitOptions ?? []).map(
    (count) => ({ value: String(count), label: `${count}개씩 보기` }),
  );

  const go = (next: number) => {
    if (next < 1 || next > totalPages || next === page) return;
    onChange?.(next);
  };

  return (
    <nav
      aria-label="페이지네이션"
      className={cn(
        "flex items-center",
        hasLimit ? "w-[736px] justify-between" : "gap-2",
        className,
      )}
    >
      {hasLimit && (
        <Dropdown
          size="s"
          className="w-[100px]"
          options={limitDropdownOptions}
          value={String(currentLimit)}
          onChange={(value) => onLimitChange?.(Number(value))}
        />
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="첫 페이지"
          disabled={page <= 1}
          onClick={() => go(1)}
          className={CARET_BUTTON}
        >
          <CaretLineLeftIcon />
        </button>
        <button
          type="button"
          aria-label="이전 페이지"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
          className={CARET_BUTTON}
        >
          <CaretLeftIcon />
        </button>
        {buildPageItems(page, totalPages).map((item) =>
          typeof item === "number" ? (
            <button
              key={item}
              type="button"
              aria-current={item === page ? "page" : undefined}
              onClick={() => go(item)}
              className={cn(
                PAGE_BUTTON_BASE,
                item === page ? PAGE_ACTIVE : PAGE_INACTIVE,
              )}
            >
              {item}
            </button>
          ) : (
            <span key={item} aria-hidden="true" className={ELLIPSIS}>
              …
            </span>
          ),
        )}
        <button
          type="button"
          aria-label="다음 페이지"
          disabled={page >= totalPages}
          onClick={() => go(page + 1)}
          className={CARET_BUTTON}
        >
          <CaretRightIcon />
        </button>
        <button
          type="button"
          aria-label="마지막 페이지"
          disabled={page >= totalPages}
          onClick={() => go(totalPages)}
          className={CARET_BUTTON}
        >
          <CaretLineRightIcon />
        </button>
      </div>
      {hasLimit && <div aria-hidden="true" className="h-[34px] w-[100px]" />}
    </nav>
  );
}
