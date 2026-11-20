import { useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** 열린 Dialog → 열린 순번. 순번은 렌더 단계에서 매겨 부모가 자식보다 먼저(작게) 받는다
 *  — 이펙트는 자식부터 실행되므로 이펙트에서 매기면 중첩 다이얼로그 순서가 뒤집힌다. */
const openDialogs = new Map<string, number>();
let dialogSeq = 0;

function isTopDialog(id: string): boolean {
  const mine = openDialogs.get(id);
  if (mine === undefined) return false;
  for (const seq of openDialogs.values()) if (seq > mine) return false;
  return true;
}

export type DialogActionVariant = "primary" | "danger" | "secondary";

export interface DialogAction {
  label: string;
  /** default: 'secondary' */
  variant?: DialogActionVariant;
  onClick: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  /** default: '처리 중...' */
  loadingLabel?: string;
}

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** 제목 오른쪽에 붙는 요소 (체크박스·토글 등) */
  titleAside?: ReactNode;
  description?: ReactNode;
  /** default: 'md' */
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
  /** default: true */
  closeOnBackdrop?: boolean;
  /** default: true */
  closeOnEsc?: boolean;
  /** 본문 자유 영역 */
  children?: ReactNode;
  /**
   * 하단 액션 버튼.
   * - 2개일 때: 첫 번째 flex-1 (취소 권장), 마지막 flex-[2] (주 액션)
   * - 1개 또는 3개+: 모두 flex-1
   */
  actions?: DialogAction[];
}

const SIZES: Record<NonNullable<DialogProps["size"]>, string> = {
  sm: "max-w-[384px]",
  md: "max-w-[440px]",
  lg: "max-w-[520px]",
  xl: "max-w-[760px]",
  "2xl": "max-w-[1100px]",
  /** 입력 칸이 많은 편집 테이블용 — 1440 화면에서 좌우 여백만 남기고 쓴다 */
  "3xl": "max-w-[1360px]",
};

const VARIANT_CLASSES: Record<DialogActionVariant, string> = {
  primary: "bg-accent text-white hover:opacity-90",
  danger: "bg-danger text-white hover:opacity-90",
  secondary: "border border-line text-ink-2 hover:bg-panel-2",
};

export function Dialog({
  isOpen,
  onClose,
  title,
  titleAside,
  description,
  size = "md",
  closeOnBackdrop = true,
  closeOnEsc = true,
  children,
  actions,
}: DialogProps) {
  const dialogId = useId();
  // 배경에서 시작한 클릭만 닫힘으로 인정 — 입력란에서 드래그 선택하다 배경에서 놓아도 닫히지 않게
  const pressStartedOnBackdrop = useRef(false);

  // 열린 순번 — 열릴 때마다 새로 매긴다(렌더 단계, 부모 → 자식 순)
  const openSeq = useMemo(() => (isOpen ? ++dialogSeq : 0), [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    openDialogs.set(dialogId, openSeq);
    return () => {
      openDialogs.delete(dialogId);
    };
  }, [isOpen, dialogId, openSeq]);

  // ESC 키 닫힘 — 중첩 다이얼로그(중복 확인 등) 위에서 누르면 부모 폼까지 닫히던 문제 방지.
  // 내부 컴포넌트(날짜 팝오버 등)가 ESC 를 처리했으면(defaultPrevented) 다이얼로그는 무시한다
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (!isTopDialog(dialogId)) return;
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, closeOnEsc, onClose, dialogId]);

  // body 스크롤 잠금
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const useTwoColLayout = (actions?.length ?? 0) === 2;

  // Portal — document.body 에 렌더링하여 부모 stacking context 영향 회피.
  // stopPropagation — 테이블 행 onClick 등 부모 핸들러로 클릭이 전파되지 않도록 차단.
  return createPortal(
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 px-4"
      onMouseDown={(e) => {
        pressStartedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        e.stopPropagation();
        const startedOnBackdrop = pressStartedOnBackdrop.current;
        pressStartedOnBackdrop.current = false;
        if (closeOnBackdrop && startedOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-panel rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.2)] w-full ${SIZES[size]} flex flex-col max-h-[90vh]`}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 shrink-0">
          {titleAside ? (
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-16 font-semibold text-ink">{title}</h2>
              {titleAside}
            </div>
          ) : (
            <h2 className="text-16 font-semibold text-ink">{title}</h2>
          )}
          {description && (
            <p className="text-13 text-ink-2 mt-1.5 leading-relaxed">{description}</p>
          )}
        </div>

        {/* Content */}
        {children && (
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pt-1 px-6 pb-4">
            {children}
          </div>
        )}

        {/* Footer */}
        {actions && actions.length > 0 && (
          <div className="px-6 pb-6 pt-2 flex gap-2 shrink-0">
            {actions.map((action, i) => {
              const isLast = i === actions.length - 1;
              const variant = action.variant ?? "secondary";
              const disabled = !!(action.isDisabled || action.isLoading);
              const flexClass = useTwoColLayout ? (isLast ? "flex-[2]" : "flex-1") : "flex-1";
              return (
                <button
                  key={i}
                  onClick={action.onClick}
                  disabled={disabled}
                  className={`h-10 rounded-lg text-13 font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${flexClass}`}
                >
                  {action.isLoading ? (action.loadingLabel ?? "처리 중...") : action.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
