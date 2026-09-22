import { FileArrowDownIcon, XCircleIcon } from "@/src/shared/icon";
import { cn } from "@/src/shared/utils/cn";

/**
 * KAISA 업로드된 파일 칩 — Figma 디자인 시스템 (node 19:18938) 기반.
 *
 * xButton 유무 변형을 실제 Figma 노드로 확인해 반영.
 * - 카드: 200px 고정폭, white 배경 + primary-400 1px border, 8px radius
 * - 파일명(확장자 제외)만 말줄임 — 확장자·용량은 항상 온전히 표시
 * - onRemove 전달 시 우측 상단 XCircle(red-500) 삭제 버튼 노출 (Figma xButton=on)
 */
export interface UploadedFileProps {
  /** 파일명 — 마지막 점 기준으로 확장자를 분리해 표시 */
  fileName: string;
  /** 용량 라벨 (예: "1.2mb") */
  fileSize: string;
  /** 전달 시 삭제 버튼 노출 */
  onRemove?: () => void;
  className?: string;
}

export function UploadedFile({
  fileName,
  fileSize,
  onRemove,
  className,
}: UploadedFileProps) {
  // 확장자 분리 — 파일명 부분만 truncate되고 ".확장자"는 항상 보이게 (Figma 구조)
  const dot = fileName.lastIndexOf(".");
  const baseName = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot) : "";

  return (
    <div
      className={cn(
        "relative flex w-[200px] items-center gap-2 rounded-lg border border-solid border-primary-400 bg-white px-3 py-2 font-sans",
        className,
      )}
    >
      <span className="size-6 shrink-0 text-gray-600">
        <FileArrowDownIcon />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start text-sm leading-normal tracking-[-0.03em]">
        <div className="flex w-full items-start font-semibold text-gray-900">
          <p className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            {baseName}
          </p>
          <p className="shrink-0 whitespace-nowrap">{extension}</p>
        </div>
        <p className="text-gray-500">{fileSize}</p>
      </div>
      {onRemove && (
        <button
          type="button"
          aria-label={`${fileName} 삭제`}
          onClick={onRemove}
          className="absolute -top-[13px] -right-2 size-5 cursor-pointer"
        >
          <XCircleIcon className="size-full text-red-500" />
        </button>
      )}
    </div>
  );
}
