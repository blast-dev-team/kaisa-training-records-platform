import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type DialogActionVariant = 'primary' | 'danger' | 'secondary'

export interface DialogAction {
  label: string
  /** default: 'secondary' */
  variant?: DialogActionVariant
  onClick: () => void
  isLoading?: boolean
  isDisabled?: boolean
  /** default: '처리 중...' */
  loadingLabel?: string
}

interface DialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  /** default: 'md' */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** default: true */
  closeOnBackdrop?: boolean
  /** default: true */
  closeOnEsc?: boolean
  /** 본문 자유 영역 */
  children?: ReactNode
  /**
   * 하단 액션 버튼.
   * - 2개일 때: 첫 번째 flex-1 (취소 권장), 마지막 flex-[2] (주 액션)
   * - 1개 또는 3개+: 모두 flex-1
   */
  actions?: DialogAction[]
}

const SIZES: Record<NonNullable<DialogProps['size']>, string> = {
  sm: 'max-w-[384px]',
  md: 'max-w-[440px]',
  lg: 'max-w-[520px]',
  xl: 'max-w-[760px]',
}

const VARIANT_CLASSES: Record<DialogActionVariant, string> = {
  primary: 'bg-accent text-white hover:opacity-90',
  danger: 'bg-danger text-white hover:opacity-90',
  secondary: 'border border-line text-ink-2 hover:bg-panel-2',
}

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEsc = true,
  children,
  actions,
}: DialogProps) {
  // ESC 키 닫힘
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, closeOnEsc, onClose])

  // body 스크롤 잠금
  useEffect(() => {
    if (!isOpen) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [isOpen])

  if (!isOpen) return null

  const useTwoColLayout = (actions?.length ?? 0) === 2

  // Portal — document.body 에 렌더링하여 부모 stacking context 영향 회피.
  // stopPropagation — 테이블 행 onClick 등 부모 핸들러로 클릭이 전파되지 않도록 차단.
  return createPortal(
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => {
        e.stopPropagation()
        if (closeOnBackdrop && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`bg-panel rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.2)] w-full ${SIZES[size]} flex flex-col max-h-[90vh]`}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 shrink-0">
          <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
          {description && (
            <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed">{description}</p>
          )}
        </div>

        {/* Content */}
        {children && (
          <div className="px-6 pb-4 flex-1 overflow-y-auto scrollbar-thin">
            {children}
          </div>
        )}

        {/* Footer */}
        {actions && actions.length > 0 && (
          <div className="px-6 pb-6 pt-2 flex gap-2 shrink-0">
            {actions.map((action, i) => {
              const isLast = i === actions.length - 1
              const variant = action.variant ?? 'secondary'
              const disabled = !!(action.isDisabled || action.isLoading)
              const flexClass = useTwoColLayout
                ? isLast
                  ? 'flex-[2]'
                  : 'flex-1'
                : 'flex-1'
              return (
                <button
                  key={i}
                  onClick={action.onClick}
                  disabled={disabled}
                  className={`h-10 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${flexClass}`}
                >
                  {action.isLoading
                    ? action.loadingLabel ?? '처리 중...'
                    : action.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
