import { useState } from "react";

import { ClockIcon } from "@/src/shared/icon";
import { Dropdown, type DropdownOption } from "@/src/shared/ui/dropdown/dropdown";
import { cn } from "@/src/shared/utils/cn";

/**
 * KAISA 시간 선택 — Figma 디자인 시스템 (node 19:19024) 기준.
 *
 * 시:분 필드 쌍 + AM/PM 토글. Figma 변형 4종(label/icon/meridiem/dropdown)을
 * props 조합으로 표현한다.
 * - input: 60px 직접 입력 필드 (Figma 기본 변형)
 * - dropdown: 80px 드롭다운 필드 — 공용 Dropdown 컴포넌트 재사용
 * - meridiem: 12시간제("12","01"~"11") + AM/PM pill, off면 24시간제("00"~"23")
 * - label: 필드 위 14px gray-400 라벨, icon: 선행 Clock 아이콘
 */
export interface TimeSelectionValue {
  period: "AM" | "PM";
  hour: string;
  minute: string;
}

export interface TimeSelectionProps {
  /** 필드 위 라벨 — 생략 시 라벨 없는 변형 */
  label?: string;
  /** 선행 Clock 아이콘 (Figma icon=on) */
  icon?: boolean;
  /** AM/PM 토글 표시 (기본값: true) */
  meridiem?: boolean;
  /** 필드 형태 — 직접 입력 | 드롭다운 (기본값: input) */
  variant?: "input" | "dropdown";
  /** 초기값 */
  defaultValue?: TimeSelectionValue;
  /** 값 변경 시 호출 */
  onChange?: (value: TimeSelectionValue) => void;
  className?: string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

const toOption = (value: string): DropdownOption => ({ value, label: value });

const hourOptionsOf = (meridiem: boolean): DropdownOption[] =>
  (meridiem
    ? ["12", ...Array.from({ length: 11 }, (_, i) => pad2(i + 1))]
    : Array.from({ length: 24 }, (_, i) => pad2(i))
  ).map(toOption);

const MINUTE_OPTIONS: DropdownOption[] = Array.from(
  { length: 60 },
  (_, i) => toOption(pad2(i)),
);

const INPUT_FIELD =
  "w-[60px] rounded-xl border border-solid border-gray-300 bg-gray-100 px-4 py-3 text-center text-base leading-normal tracking-[-0.03em] text-gray-800 placeholder:text-gray-400 focus:border-primary-400 focus:outline-none";

export function TimeSelection({
  label,
  icon = false,
  meridiem = true,
  variant = "input",
  defaultValue,
  onChange,
  className,
}: TimeSelectionProps) {
  const [value, setValue] = useState<TimeSelectionValue>(
    defaultValue ?? { period: "AM", hour: meridiem ? "12" : "00", minute: "00" },
  );

  const handleChange = (patch: Partial<TimeSelectionValue>) => {
    const next = { ...value, ...patch };
    setValue(next);
    onChange?.(next);
  };

  // 직접 입력 — 숫자 2자리만 허용
  const handleInput = (field: "hour" | "minute", raw: string) => {
    handleChange({ [field]: raw.replace(/[^0-9]/g, "").slice(0, 2) });
  };

  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2 font-sans",
        className,
      )}
    >
      {label && (
        <span className="text-sm leading-normal tracking-[-0.03em] text-gray-400">
          {label}
        </span>
      )}
      <div className="flex items-center gap-3">
        {icon && (
          <span className="size-6 shrink-0 text-gray-500">
            <ClockIcon />
          </span>
        )}

        {variant === "input" ? (
          <>
            <input
              value={value.hour}
              onChange={(e) => handleInput("hour", e.target.value)}
              inputMode="numeric"
              maxLength={2}
              placeholder={meridiem ? "12" : "00"}
              aria-label="시"
              className={INPUT_FIELD}
            />
            <span
              aria-hidden="true"
              className="w-[6px] text-lg leading-normal font-bold tracking-[-0.03em] text-gray-700"
            >
              :
            </span>
            <input
              value={value.minute}
              onChange={(e) => handleInput("minute", e.target.value)}
              inputMode="numeric"
              maxLength={2}
              placeholder="00"
              aria-label="분"
              className={INPUT_FIELD}
            />
          </>
        ) : (
          <>
            <Dropdown
              className="w-[80px]"
              options={hourOptionsOf(meridiem)}
              value={value.hour}
              onChange={(hour) => handleChange({ hour: String(hour) })}
              placeholder="00"
            />
            <span
              aria-hidden="true"
              className="w-[6px] text-lg leading-normal font-bold tracking-[-0.03em] text-gray-700"
            >
              :
            </span>
            <Dropdown
              className="w-[80px]"
              options={MINUTE_OPTIONS}
              value={value.minute}
              onChange={(minute) => handleChange({ minute: String(minute) })}
              placeholder="00"
            />
          </>
        )}

        {meridiem && (
          <div className="flex items-center overflow-hidden rounded-xl">
            {(["AM", "PM"] as const).map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={value.period === period}
                onClick={() => handleChange({ period })}
                className={cn(
                  "w-[60px] cursor-pointer px-4 py-3 text-base leading-normal font-semibold tracking-[-0.03em] select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
                  value.period === period
                    ? "bg-primary-700 text-white"
                    : "bg-gray-200 text-gray-500",
                )}
              >
                {period}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
