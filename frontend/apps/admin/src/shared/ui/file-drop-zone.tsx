import { useRef, useState, type ReactNode } from "react";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "react-toastify";
import { cn } from "@/src/shared/utils/cn";

interface Props {
  /** 클릭 시 — 보통 숨겨둔 file input 을 연다 */
  onClick: () => void;
  /** 드롭된 파일 중 .xlsx 만 넘긴다 */
  onFiles: (files: File[]) => void;
  /** false 면 첫 파일 하나만 넘긴다 */
  multiple?: boolean;
  disabled?: boolean;
  /** 본문 아래 보조 안내 (헤더 형식 등) */
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

const isXlsx = (f: File) => f.name.toLowerCase().endsWith(".xlsx");

/** 엑셀 업로드 영역 — 클릭해서 고르거나 파일을 끌어다 놓는다 */
export function FileDropZone({
  onClick,
  onFiles,
  multiple = false,
  disabled = false,
  hint,
  className,
  children,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  // 자식 요소로 들어갈 때도 dragleave 가 터지므로 깊이로 진입 여부를 센다
  const depthRef = useRef(0);

  const reset = () => {
    depthRef.current = 0;
    setIsDragging(false);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onDragEnter={(e) => {
        e.preventDefault();
        depthRef.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(e) => {
        // preventDefault 가 없으면 브라우저가 drop 을 받지 않고 파일을 새 탭으로 연다
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depthRef.current -= 1;
        if (depthRef.current <= 0) reset();
      }}
      onDrop={(e) => {
        e.preventDefault();
        reset();
        if (disabled) return;
        const dropped = Array.from(e.dataTransfer.files);
        const xlsx = dropped.filter(isXlsx);
        if (xlsx.length === 0) {
          if (dropped.length > 0) toast.error("엑셀 파일(.xlsx)만 올릴 수 있어요");
          return;
        }
        if (xlsx.length < dropped.length) toast.info(".xlsx 가 아닌 파일은 빼고 읽어요");
        onFiles(multiple ? xlsx : xlsx.slice(0, 1));
      }}
      className={cn(
        "flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 transition-colors hover:border-accent hover:text-accent",
        isDragging ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-3",
        className,
      )}
    >
      <FileSpreadsheet className="size-8" />
      <span className="text-14">{isDragging ? "여기에 놓으세요" : children}</span>
      {hint && !isDragging && <span className="text-11 text-ink-3">{hint}</span>}
    </button>
  );
}
