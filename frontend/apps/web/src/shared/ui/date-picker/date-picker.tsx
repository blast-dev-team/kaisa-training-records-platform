import { useMemo, useState } from "react";

import { CaretLeftIcon, CaretRightIcon } from "@/src/shared/icon";
import { cn } from "@/src/shared/utils/cn";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * KAISA 데이트 피커 — Figma 디자인 시스템 (node 19:18441) 기준.
 *
 * 월 이동 + 날짜 선택 + "확인" 버튼으로 확정하는 인라인 캘린더.
 * - 카드: 335px 고정폭, white 배경, 20px radius
 * - 셀: 36px, 선택=primary-700 배경, 오늘=gray-800 텍스트, 비활성=gray-200 배경
 * - hover 시 primary-300 3px border — 모든 셀에 투명 border를 예약해 layout shift 방지
 * - 확인 버튼: 선택 없으면 gray-300(disabled), 있으면 primary-50
 */
export interface DatePickerProps {
  /** 초기 선택 날짜 */
  defaultValue?: Date | null;
  /** 확인 버튼 클릭 시 호출 — 선택된 날짜 전달 */
  onConfirm?: (date: Date) => void;
  /** 특정 날짜 비활성화 (예: 과거 날짜 차단) */
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
        "flex w-[335px] flex-col items-center gap-2 rounded-[20px] bg-white p-4 font-sans",
        className,
      )}
    >
      {/* 헤더 — 이전/다음 월 이동 + 연도·월 표시 */}
      <div className="flex w-full items-center justify-between px-1">
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => navigateMonth(-1)}
          className="size-6 shrink-0 cursor-pointer text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          <CaretLeftIcon />
        </button>
        <div className="flex flex-col items-center leading-normal tracking-[-0.03em]">
          <p className="text-xs font-semibold text-gray-400">{viewYear}</p>
          <p className="text-xl font-semibold text-black">{viewMonth + 1}월</p>
        </div>
        <button
          type="button"
          aria-label="다음 달"
          onClick={() => navigateMonth(1)}
          className="size-6 shrink-0 cursor-pointer text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          <CaretRightIcon />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="flex size-9 items-center justify-center px-1 py-2 text-xs leading-normal font-semibold tracking-[-0.03em] text-gray-500"
          >
            {weekday}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 — 이월 날짜는 장식(div)으로, 당월 날짜는 버튼으로 */}
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} className="grid grid-cols-7 gap-1">
          {week.map(({ date, outside }) => {
            const isSelected = selected !== null && isSameDay(date, selected);
            const isToday = isSameDay(date, today);
            const isDisabled = !outside && isDisabledDate?.(date) === true;

            if (outside) {
              return (
                <div
                  key={date.getTime()}
                  aria-hidden="true"
                  className="flex size-9 items-center justify-center text-xs leading-normal font-bold tracking-[-0.03em] text-gray-400"
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
                  "flex size-9 items-center justify-center rounded-lg border-[3px] border-transparent text-xs leading-normal font-bold tracking-[-0.03em] text-black select-none",
                  !isDisabled &&
                    "cursor-pointer hover:border-primary-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
                  isToday && "text-gray-800",
                  isDisabled && "cursor-not-allowed bg-gray-200 text-gray-400",
                  isSelected && "bg-primary-700 text-white",
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
          "w-full rounded-xl px-4 py-3 text-base leading-normal font-semibold tracking-[-0.03em] whitespace-nowrap select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
          selected === null
            ? "cursor-not-allowed bg-gray-300 text-white"
            : "cursor-pointer bg-primary-50 text-primary-500",
        )}
      >
        확인
      </button>
    </div>
  );
}
