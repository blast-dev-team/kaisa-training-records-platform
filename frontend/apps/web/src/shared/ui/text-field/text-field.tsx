import { useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/src/shared/utils/cn";

/**
 * KAISA 텍스트 필드 — Figma 디자인 시스템 (node 19:14829) 기반.
 *
 * 5종 상태(active/focused/typing/value/error·disabled) 스펙을 실제 Figma 노드로 확인해 반영.
 * focused·typing은 CSS :focus-within 유사 클래스로 자동 처리된다.
 * 라벨·헬퍼 텍스트는 props 유무로 표시(.off 변형 = prop 생략).
 */
export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 입력창 위 라벨 — 생략 시 라벨 없는 변형 */
  label?: string;
  /** 입력창 아래 도움말 — 생략 시 헬퍼 없는 변형 */
  helperText?: string;
  /** 필수 표시 — 라벨 옆 빨간 별표 (Figma essential 변형) */
  essential?: boolean;
  /** 에러 상태 — 라벨·입력창·헬퍼 전부 red 톤 */
  error?: boolean;
  /** 입력창 우측 아이콘 (svg 권장 — 래퍼가 크기를 강제한다) */
  rightIcon?: ReactNode;
}

const BOX_BASE =
  "flex items-center gap-1 rounded-xl border px-4 py-3 transition-[background-color,border-color,color]";

const BOX_DEFAULT =
  "border-gray-300 bg-gray-100 focus-within:border-primary-400 focus-within:bg-primary-50";

const BOX_ERROR =
  "border-red-500 bg-red-50 focus-within:border-red-500 focus-within:bg-red-50";

const BOX_DISABLED =
  "has-disabled:border-gray-300 has-disabled:bg-gray-200";

const INPUT_BASE =
  "w-full min-w-0 flex-1 bg-transparent font-sans text-base leading-normal tracking-[-0.03em] text-gray-800 outline-none placeholder:text-gray-400 focus:text-primary-400 focus:placeholder:text-primary-400";

const INPUT_ERROR =
  "text-red-500 placeholder:text-red-500 focus:text-red-500 focus:placeholder:text-red-500";

const INPUT_DISABLED =
  "disabled:text-gray-400 disabled:placeholder:text-gray-400 disabled:cursor-not-allowed";

export function TextField({
  label,
  helperText,
  essential = false,
  error = false,
  rightIcon,
  className,
  id,
  disabled = false,
  ...props
}: TextFieldProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const describedBy = helperText ? `${inputId}-helper` : undefined;

  return (
    <div className={cn("flex w-full flex-col items-start gap-1", className)}>
      {label && (
        <label
          htmlFor={inputId}
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
        <input
          id={inputId}
          disabled={disabled}
          aria-invalid={error || undefined}
          aria-describedby={describedBy}
          className={cn(
            INPUT_BASE,
            INPUT_DISABLED,
            error && INPUT_ERROR,
          )}
          {...props}
        />
        {rightIcon && (
          <span className="size-5 shrink-0 [&>svg]:size-full">{rightIcon}</span>
        )}
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
