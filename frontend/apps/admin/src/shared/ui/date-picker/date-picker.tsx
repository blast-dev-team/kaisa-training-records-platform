import { useMemo, useState } from "react";

import { cn } from "@/src/shared/utils/cn";

import { CaretDoubleLeftIcon, CaretDoubleRightIcon, CaretLeftIcon, CaretRightIcon } from "./icons";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * 인라인 캘린더 — web 앱 KAISA DatePicker 이식(admin 토큰 재스타일).
 *
 * 네이티브 <input type="date"> 세그먼트는 브라우저마다 타이핑 동작이 달라
 * 두 자리 입력이 쪼개지는 문제가 있다. 여기서는 클릭 선택 + 확인 버튼으로 확정한다.
 */
export interface DatePickerProps {
  /** 초기 선택 날짜 */
  defaultValue?: Date | null;
  /** 확인 버튼 클릭 시 호출 — 선택된 날짜 전달 */
  onConfirm?: (date: Date) => void;
  /** 특정 날짜 비활성화 (예: 범위 밖 차단) */
  isDisabledDate?: (date: Date) => boolean;
  className?: string;
}

export function DatePicker({
  defaultValue = null,
  onConfirm,
  isDisabledDate,
  className,
}: DatePickerProps) {
  const initialView = defaultValue ?? new Date();
  const [viewYear, setViewYear] = useState(initialView.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialView.getMonth());
  const [selected, setSelected] = useState<Date | null>(defaultValue);

  const today = new Date();

  // 뷰 월의 7열 그리드 — 앞뒤 이월 날짜를 포함해 주 단위로 자른다
  const weeks = useMemo(() => {
    const leading = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: { date: Date; outside: boolean }[] = [];
    for (let i = 1; i <= leading; i++) {
      cells.push({ date: new Date(viewYear, viewMonth, 1 - i), outside: true });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ date: new Date(viewYear, viewMonth, day), outside: false });
    }
    const trailing = (7 - (cells.length % 7)) % 7;
    for (let i = 1; i <= trailing; i++) {
      cells.push({ date: new Date(viewYear, viewMonth + 1, i), outside: true });
    }
    const rows: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [viewYear, viewMonth]);

  const navigateMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const handleSelectDay = (date: Date) => {
    if (isDisabledDate?.(date)) return;
    setSelected(date);
  };

  return (
    <div
      className={cn(
        "flex w-[320px] flex-col items-center gap-2 rounded-lg border border-line bg-panel p-4 shadow-card",
        className,
      )}
    >
      {/* 헤더 — 이전/다음 연도·월 이동 + 연도·월 표시 */}
      <div className="flex w-full items-center justify-between px-1">
        <div className="flex items-center">
          <button
            type="button"
            aria-label="이전 해"
            onClick={() => navigateMonth(-12)}
            className="size-6 shrink-0 cursor-pointer text-ink-2 hover:text-ink"
          >
            <CaretDoubleLeftIcon />
          </button>
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => navigateMonth(-1)}
            className="size-6 shrink-0 cursor-pointer text-ink-2 hover:text-ink"
          >
            <CaretLeftIcon />
          </button>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-13 font-medium text-ink-3">{viewYear}</span>
          <span className="text-15 font-semibold text-ink">{viewMonth + 1}월</span>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            aria-label="다음 달"
            onClick={() => navigateMonth(1)}
            className="size-6 shrink-0 cursor-pointer text-ink-2 hover:text-ink"
          >
            <CaretRightIcon />
          </button>
          <button
            type="button"
            aria-label="다음 해"
            onClick={() => navigateMonth(12)}
            className="size-6 shrink-0 cursor-pointer text-ink-2 hover:text-ink"
          >
            <CaretDoubleRightIcon />
          </button>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid w-full grid-cols-7 gap-1">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="flex size-9 items-center justify-center text-11 font-semibold text-ink-3"
          >
            {weekday}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 — 이월 날짜는 장식(div)으로, 당월 날짜는 버튼으로 */}
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} className="grid w-full grid-cols-7 gap-1">
          {week.map(({ date, outside }) => {
            const isSelected = selected !== null && isSameDay(date, selected);
            const isToday = isSameDay(date, today);
            const isDisabled = !outside && isDisabledDate?.(date) === true;

            if (outside) {
              return (
                <div
                  key={date.getTime()}
                  aria-hidden="true"
                  className="flex size-9 items-center justify-center text-12 text-ink-3"
                >
                  {date.getDate()}
                </div>
              );
            }

            return (
              <button
                key={date.getTime()}
                type="button"
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                onClick={() => handleSelectDay(date)}
                className={cn(
                  // 모든 셀에 투명 border를 예약해 hover 시 layout shift 방지
                  "flex size-9 items-center justify-center rounded-md border-2 border-transparent text-12 font-medium text-ink select-none",
                  !isDisabled && "cursor-pointer hover:border-accent-soft hover:bg-accent-soft",
                  isToday && !isSelected && "font-semibold text-accent-ink",
                  isDisabled && "cursor-not-allowed bg-panel-2 text-ink-3",
                  isSelected && "bg-accent text-white hover:bg-accent",
                )}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      ))}

      {/* 확인 — 선택 없으면 비활성 */}
      <button
        type="button"
        disabled={selected === null}
        onClick={() => {
          if (selected !== null) onConfirm?.(selected);
        }}
        className={cn(
          "w-full rounded-md px-3 py-2 text-13 font-semibold whitespace-nowrap select-none",
          selected === null
            ? "cursor-not-allowed bg-panel-2 text-ink-3"
            : "cursor-pointer bg-accent-soft text-accent-ink hover:bg-accent hover:text-white",
        )}
      >
        확인
      </button>
    </div>
  );
}
