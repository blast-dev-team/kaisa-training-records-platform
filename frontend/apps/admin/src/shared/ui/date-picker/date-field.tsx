import { useEffect, useRef, useState } from "react";

import { cn } from "@/src/shared/utils/cn";

import { CalendarBlankIcon } from "./icons";
import { DatePicker } from "./date-picker";

/**
 * 날짜 선택 필드 — 텍스트 입력 + 달력 팝오버 하이브리드.
 *
 * 네이티브 <input type="date"> 세그먼트는 브라우저별 타이핑 동작이 달라
 * 두 자리 입력이 쪼개진다(예: 27 입력 → 02·07 분리). 여기서는 숫자만
 * 타이핑하면 하이픈이 자동 채워지고(20260927 → 2026-09-27) 8자 완성 시
 * 확정하거나, 달력 아이콘으로 클릭 선택한다. 값은 'YYYY-MM-DD' 문자열로
 * 주고받는다.
 */
export interface DateFieldProps {
  /** 선택값 'YYYY-MM-DD' — 빈값이면 미선택 표시 */
  value?: string;
  /** 확정된 날짜 — 'YYYY-MM-DD' (입력 완성 시 즉시, 달력은 확인 버튼) */
  onChange: (dateYMD: string) => void;
  placeholder?: string;
  /** 접근성 라벨 — 입력칸에 필요 */
  ariaLabel: string;
  /** 선택 가능한 최소 날짜 'YYYY-MM-DD' (달력에만 적용 — 타이핑은 자유) */
  minDate?: string;
  /** 선택 가능한 최대 날짜 'YYYY-MM-DD' (달력에만 적용 — 타이핑은 자유) */
  maxDate?: string;
  /** 팝오버 정렬 — 트리거가 화면 우측 끝에 붙어 있을 때 right */
  popoverAlign?: "left" | "right";
  /** 밀도 높은 레이아웃용 트리거 스타일 오버라이드 (예: h-6 테이블 행) */
  triggerClassName?: string;
  className?: string;
}

/** 로컬 기준 'YYYY-MM-DD' */
function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 'YYYY-MM-DD' 파싱 — 존재하지 않는 날짜(2026-13-99 등)는 null */
function parseYMD(raw: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) || formatDate(date) !== raw ? null : raw;
}

export function DateField({
  value = "",
  onChange,
  placeholder = "YYYY-MM-DD",
  ariaLabel,
  minDate,
  maxDate,
  popoverAlign = "left",
  triggerClassName,
  className,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  // 타이핑 중 임시값 — null이면 편집 중이 아니라 prop 값을 그대로 보여준다
  const [draft, setDraft] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 열림 상태에서 바깥 클릭 시 닫기 + draft 정리
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  // 'YYYY-MM-DD' → 로컬 자정 Date — 오프셋 없는 파싱으로 하루 어긋남 방지
  const shown = draft ?? value;
  const selectedDate = shown ? new Date(`${shown}T00:00:00`) : null;

  /** 완성된 날짜면 확정, 아니면 유지 — blur에서 부정확한 입력은 되돌린다 */
  const handleBlur = () => {
    if (draft === null) return;
    if (draft === "") {
      onChange("");
      setDraft(null);
      return;
    }
    const parsed = parseYMD(draft);
    if (parsed) {
      onChange(parsed);
      setDraft(null);
    } else {
      // 유효하지 않은 입력 — 마지막 확정값으로 되돌림
      setDraft(null);
    }
  };

  return (
    <div
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setDraft(null);
          setOpen(false);
        }
        if (event.key === "Enter") (event.target as HTMLElement).blur();
      }}
      className={cn("relative flex w-full flex-col items-start", className)}
    >
      <div
        className={cn(
          "flex h-9 w-full items-center gap-1 rounded-md border bg-panel pl-3 pr-1 text-sm transition-[border-color]",
          "focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/20",
          open ? "border-accent" : "border-line hover:border-ink-3",
          triggerClassName,
        )}
      >
        <input
          aria-label={ariaLabel}
          inputMode="numeric"
          value={shown}
          placeholder={placeholder}
          onChange={(e) => {
            // 숫자만 받아 4-2-2 하이픈 자동 채움 — "20260927" → "2026-09-27"
            const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
            let next = digits;
            if (digits.length > 6) next = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
            else if (digits.length > 4) next = `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
            setDraft(next);
            // 8자 완성 + 유효 날짜면 즉시 확정
            const parsed = parseYMD(next);
            if (parsed) onChange(parsed);
          }}
          onBlur={handleBlur}
          className="h-full min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-3 focus:outline-none"
        />
        <button
          type="button"
          aria-label="달력 열기"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-ink-3 hover:bg-panel-2 hover:text-ink"
        >
          <span className="size-4 [&>svg]:size-full">
            <CalendarBlankIcon />
          </span>
        </button>
      </div>

      {open && (
        <div
          className={cn(
            "absolute top-full z-30 mt-1 drop-shadow-[0_4px_12px_rgba(82,63,105,0.12)]",
            popoverAlign === "right" ? "right-0" : "left-0",
          )}
        >
          <DatePicker
            defaultValue={selectedDate}
            isDisabledDate={(date) => {
              if (minDate && date < new Date(`${minDate}T00:00:00`)) return true;
              if (maxDate && date > new Date(`${maxDate}T00:00:00`)) return true;
              return false;
            }}
            onConfirm={(date) => {
              const ymd = formatDate(date);
              onChange(ymd);
              setDraft(null);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
