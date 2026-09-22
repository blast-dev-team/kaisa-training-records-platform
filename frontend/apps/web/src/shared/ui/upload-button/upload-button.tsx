import type { ButtonHTMLAttributes } from "react";

import { UploadIcon } from "@/src/shared/icon";
import { cn } from "@/src/shared/utils/cn";

/**
 * KAISA 업로드 버튼 — Figma 디자인 시스템 (node 19:18933) 기반.
 *
 * 버튼 + 안내 텍스트 조합. 안내 문구는 Figma 기본값을 따르되 props로 교체 가능.
 * - 버튼: primary-50 배경, 12px radius, Upload 아이콘 + primary-500 SemiBold 16px
 * - 안내: gray-400 12px — 1줄 SemiBold(용량 제한) + 1줄 Regular(허용 확장자)
 */
export interface UploadButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 버튼 라벨 (Figma 기본값: "업로드") */
  label?: string;
  /** 안내 1줄 — 용량 제한 (Figma 기본값: "최대 10MB") */
  hint?: string;
  /** 안내 2줄 — 허용 확장자 (Figma 기본값 사용) */
  formats?: string;
}

export function UploadButton({
  label = "업로드",
  hint = "최대 10MB",
  formats = "pdb, cif, txt, sdf, smile, jpg, jpeg, png, pdf",
  className,
  type = "button",
  ...props
}: UploadButtonProps) {
  return (
    <div className={cn("flex items-center gap-3 font-sans", className)}>
      <button
        type={type}
        className={cn(
          "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary-50 px-4 py-3 text-base leading-normal font-semibold tracking-[-0.03em] whitespace-nowrap text-primary-500 select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
        )}
        {...props}
      >
        <span className="size-5 shrink-0 [&>svg]:size-full">
          <UploadIcon />
        </span>
        {label}
      </button>
      <div className="flex flex-col items-start text-xs leading-normal tracking-[-0.03em] whitespace-nowrap text-gray-400">
        <p className="font-semibold">{hint}</p>
        <p>{formats}</p>
      </div>
    </div>
  );
}
