import { useEffect, useRef, useState } from "react";

import { CalendarBlankIcon } from "@/src/shared/icon";
import { cn } from "@/src/shared/utils/cn";

import { DatePicker } from "./date-picker";

/**
 * 날짜 선택 필드 — TextField 모양 트리거 + KAISA DatePicker 팝오버.
 *
 * 네이티브 <input type="date"> 캘린더는 브라우저 UI라 디자인 시스템과 다르게
 * 보인다. 값은 URL 쿼리스트링과 같은 'YYYY-MM-DD' 문자열로 주고받는다.
 */
export interface DateFieldProps {
  /** 선택값 'YYYY-MM-DD' — 빈값이면 미선택 표시 */
  value?: string;
  /** 확인 버튼으로 확정된 날짜 — 'YYYY-MM-DD' */
  onChange: (dateYMD: string) => void;
  placeholder?: string;
  /** 접근성 라벨 — 화면에 표시되는 라벨이 없어서 필요하다 */
  ariaLabel: string;
  /** 팝오버 정렬 — 트리거가 화면 우측 끝에 붙어 있을 때 right */
  popoverAlign?: "left" | "right";
  /** 특정 날짜 비활성화 (DatePicker로 전달) */
  isDisabledDate?: (date: Date) => boolean;
  className?: string;
}

/** 로컬 기준 'YYYY-MM-DD' — KST 브라우저 가정 */
function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function DateField({
  value = "",
  onChange,
  placeholder = "YYYY-MM-DD",
  ariaLabel,
  popoverAlign = "left",
  isDisabledDate,
  className,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 열림 상태에서 바깥 클릭·Escape 시 닫기
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  // 'YYYY-MM-DD' → 로컬 자정 Date — 오프셋 없는 파싱으로 하루 어긋남 방지
  const selectedDate = value ? new Date(`${value}T00:00:00`) : null;

  return (
    <div
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
      className={cn("relative flex w-full flex-col items-start", className)}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-1 rounded-xl border px-4 py-3 font-sans text-base leading-normal tracking-[-0.03em] transition-[background-color,border-color]",
          open ? "border-primary-400 bg-gray-100" : "border-gray-300 bg-gray-100",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left",
            value ? "text-gray-800" : "text-gray-400",
          )}
        >
          {value || placeholder}
        </span>
        <span className="size-5 shrink-0 text-gray-800 [&>svg]:size-full">
          <CalendarBlankIcon />
        </span>
      </button>

      {open && (
        <div
          className={cn(
            "absolute top-full z-10 mt-1 drop-shadow-[0_4px_12px_rgba(16,24,40,0.1)]",
            popoverAlign === "right" ? "right-0" : "left-0",
          )}
        >
          <DatePicker
            defaultValue={selectedDate}
            isDisabledDate={isDisabledDate}
            onConfirm={(date) => {
              onChange(formatDate(date));
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
