import type { ReactNode } from "react";
import {
  CheckCircleIcon,
  WarningCircleIcon,
  XCircleIcon,
  XIcon,
} from "@/src/shared/icon";
import { cn } from "@/src/shared/utils/cn";

export type ToastType = "success" | "error" | "caution";

export interface ToastProps {
  /** 상태 아이콘 종류 */
  type?: ToastType;
  children: ReactNode;
  /** 지정 시 우측 닫기 버튼(X) 표시 */
  onClose?: () => void;
  className?: string;
}

const TYPE_ICON: Record<ToastType, { icon: typeof CheckCircleIcon; color: string }> = {
  success: { icon: CheckCircleIcon, color: "text-green-400" },
  error: { icon: XCircleIcon, color: "text-red-500" },
  caution: { icon: WarningCircleIcon, color: "text-yellow-400" },
};

/**
 * 토스트 — 상태 아이콘 + 메시지. onClose를 주면 우측에 닫기 버튼이 붙는다
 * (Figma removeButton 변형). 배경 gray-100 + dropShadow/xs.
 */
export function Toast({
  type = "success",
  children,
  onClose,
  className,
}: ToastProps) {
  const { icon: Icon, color } = TYPE_ICON[type];

  return (
    <div
      role="status"
      className={cn(
        "flex w-[280px] items-center rounded-xl bg-gray-100 px-3 py-2 shadow-[0_2px_16px_-1px_rgba(16,24,40,0.1)]",
        onClose ? "justify-between" : "gap-2",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("size-5 shrink-0", color)}>
          <Icon />
        </span>
        <p className="shrink-0 font-sans text-xs leading-[1.5] tracking-[-0.03em] whitespace-nowrap text-gray-700">
          {children}
        </p>
      </div>
      {onClose && (
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="flex size-4 shrink-0 cursor-pointer items-center justify-center text-gray-700"
        >
          <XIcon />
        </button>
      )}
    </div>
  );
}
