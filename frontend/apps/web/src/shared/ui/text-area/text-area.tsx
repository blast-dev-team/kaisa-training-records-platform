import {
  useId,
  useState,
  type ChangeEvent,
  type TextareaHTMLAttributes,
} from "react";

import { ResizeGripIcon } from "@/src/shared/icon";
import { cn } from "@/src/shared/utils/cn";

/**
 * KAISA 텍스트 에어리어 — Figma 디자인 시스템 (node 19:15694) 기반.
 *
 * 상태(active/focused/value/error/disabled) 스펙을 실제 Figma 노드로 확인해 반영.
 * focused는 CSS :focus-within 유사 클래스로 자동 처리된다.
 * 라벨·헬퍼 텍스트는 props 유무로 표시(.off 변형 = prop 생략).
 * letterLimit 지정 시 우측 하단에 `현재 / 상한` 글자수 카운터가 붙는다.
 */
export interface TextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** 입력창 위 라벨 — 생략 시 라벨 없는 변형 */
  label?: string;
  /** 입력창 아래 도움말 — 생략 시 헬퍼 없는 변형 */
  helperText?: string;
  /** 필수 표시 — 라벨 옆 빨간 별표 (Figma essential 변형) */
  essential?: boolean;
  /** 에러 상태 — 라벨·입력창·헬퍼 전부 red 톤 */
  error?: boolean;
  /** 글자 수 카운터 상한 — 지정 시 우측 하단 `n / N` 표시 */
  letterLimit?: number;
}

const BOX_BASE =
  "flex h-[120px] flex-col items-end justify-end gap-1 rounded-xl border px-4 py-3 transition-[background-color,border-color,color]";

const BOX_DEFAULT =
  "border-gray-300 bg-gray-100 focus-within:border-primary-400 focus-within:bg-primary-50";

const BOX_ERROR =
  "border-red-500 bg-red-50 focus-within:border-red-500 focus-within:bg-red-50";

const BOX_DISABLED = "has-disabled:border-gray-300 has-disabled:bg-gray-200";

const FIELD_BASE =
  "min-h-0 w-full flex-1 resize-none bg-transparent font-sans text-base leading-normal tracking-[-0.03em] text-gray-800 outline-none placeholder:text-gray-400 focus:text-primary-400 focus:placeholder:text-primary-400";

const FIELD_ERROR =
  "text-red-500 placeholder:text-red-500 focus:text-red-500 focus:placeholder:text-red-500";

const FIELD_DISABLED =
  "disabled:text-gray-400 disabled:placeholder:text-gray-400 disabled:cursor-not-allowed";

const COUNTER_BASE =
  "font-sans text-xs leading-normal tracking-[-0.03em] whitespace-nowrap";

export function TextArea({
  label,
  helperText,
  essential = false,
  error = false,
  letterLimit,
  className,
  id,
  value,
  defaultValue,
  disabled = false,
  onChange,
  ...props
}: TextAreaProps) {
  const fallbackId = useId();
  const textareaId = id ?? fallbackId;
  const describedBy = helperText ? `${textareaId}-helper` : undefined;

  // 비제어 모드 카운터 — 제어 모드는 value.length 우선
  const [uncontrolledLength, setUncontrolledLength] = useState(() =>
    typeof defaultValue === "string" ? defaultValue.length : 0,
  );
  const currentLength =
    typeof value === "string" ? value.length : uncontrolledLength;

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (letterLimit !== undefined && typeof value !== "string") {
      setUncontrolledLength(event.target.value.length);
    }
    onChange?.(event);
  };

  return (
    <div className={cn("flex w-full flex-col items-start gap-1", className)}>
      {label && (
        <label
          htmlFor={textareaId}
          className={cn(
            "font-sans text-sm leading-normal tracking-[-0.03em] whitespace-nowrap",
            error ? "text-red-500" : "text-gray-400",
          )}
        >
          {label}
          {essential && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}

      <div
        className={cn(BOX_BASE, error ? BOX_ERROR : BOX_DEFAULT, BOX_DISABLED)}
      >
        <textarea
          id={textareaId}
          disabled={disabled}
          aria-invalid={error || undefined}
          aria-describedby={describedBy}
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          className={cn(FIELD_BASE, FIELD_DISABLED, error && FIELD_ERROR)}
          {...props}
        />
        <div className="flex w-full items-center justify-end gap-1">
          {letterLimit !== undefined && (
            <span
              className={cn(
                COUNTER_BASE,
                error ? "text-red-500" : "text-gray-400",
              )}
            >
              {currentLength} / {letterLimit}
            </span>
          )}
          <span className="size-4 shrink-0 text-gray-400">
            <ResizeGripIcon />
          </span>
        </div>
      </div>

      {helperText && (
        <p
          id={describedBy}
          className={cn(
            "font-sans text-sm leading-normal tracking-[-0.03em]",
            error ? "text-red-500" : "text-gray-400",
          )}
        >
          {helperText}
        </p>
      )}
    </div>
  );
}
