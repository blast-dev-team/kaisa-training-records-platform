import lnpLogo from "@/src/assets/lnp-logo.png";
import { PencilSimpleIcon } from "@/src/shared/icon";
import { cn } from "@/src/shared/utils/cn";

export type ProfileSize = "s" | "m" | "l" | "xl";

export interface ProfileProps {
  /** s 40 / m 48 / l 64 / xl 100px */
  size?: ProfileSize;
  /** 프로필 이미지 URL — 생략 시 기본 LNP 로고 */
  src?: string;
  /** 이미지 대체 텍스트 */
  alt?: string;
  /** 지정 시 우하단 편집(연필) 버튼 표시 */
  onEdit?: () => void;
  className?: string;
}

const AVATAR_SIZE: Record<ProfileSize, string> = {
  s: "size-[40px]",
  m: "size-[48px]",
  l: "size-[64px]",
  xl: "size-[100px]",
};

/** 편집 버튼 우하단 위치 — Figma 변형별 돌출량(s·m 10px, l 8px, xl 2px 안쪽) */
const EDIT_OFFSET: Record<ProfileSize, string> = {
  s: "-right-2.5 -bottom-2.5",
  m: "-right-2.5 -bottom-2.5",
  l: "-right-2 -bottom-2",
  xl: "right-0.5 bottom-0.5",
};

/**
 * 프로필 아바타 — primary-400 링 원형. src 없으면 기본 LNP 로고,
 * onEdit를 주면 우하단에 primary-50 편집 버튼이 붙는다.
 */
export function Profile({
  size = "s",
  src,
  alt = "",
  onEdit,
  className,
}: ProfileProps) {
  return (
    <div className={cn("relative shrink-0", AVATAR_SIZE[size], className)}>
      <div
        className={
          "flex size-full items-center justify-center overflow-hidden rounded-full border border-solid border-primary-400 bg-white"
        }
      >
        {src ? (
          <img src={src} alt={alt} className="size-full object-cover" />
        ) : (
          <img src={lnpLogo} alt={alt} className="w-[70%]" />
        )}
      </div>
      {onEdit && (
        <button
          type="button"
          aria-label="프로필 편집"
          onClick={onEdit}
          className={cn(
            "absolute flex size-[26px] cursor-pointer items-center justify-center rounded-lg bg-primary-50 p-1",
            EDIT_OFFSET[size],
          )}
        >
          <span className="size-4 text-primary-500">
            <PencilSimpleIcon />
          </span>
        </button>
      )}
    </div>
  );
}
