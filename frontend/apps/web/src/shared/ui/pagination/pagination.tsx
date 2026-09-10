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
        {Array.from({ length: totalPages }, (_, index) => index + 1).map(
          (number) => (
            <button
              key={number}
              type="button"
              aria-current={number === page ? "page" : undefined}
              onClick={() => go(number)}
              className={cn(
                PAGE_BUTTON_BASE,
                number === page ? PAGE_ACTIVE : PAGE_INACTIVE,
              )}
            >
              {number}
            </button>
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
