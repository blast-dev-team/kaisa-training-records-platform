import * as React from "react"
import { X } from "lucide-react"

import { Input } from "@/src/shared/ui/input"
import { cn } from "@/src/shared/utils/cn"

interface SearchInputProps extends React.ComponentProps<"input"> {
  /** X 클릭 시 입력값을 비운 뒤 호출 — 검색 파라미터 초기화 등 상위 리셋 담당 */
  onClear?: () => void
}

/**
 * 검색 인풋 — 텍스트가 있으면 우측에 X 버튼이 보이고, 누르면 입력을 비운다.
 * 제어/비제어 모두 지원. 제어 모드에서는 빈값 onChange로 상위 상태를 비운다.
 */
function SearchInput({ className, onClear, onChange, value, disabled, ...props }: SearchInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const isControlled = value !== undefined
  const [internal, setInternal] = React.useState(String(props.defaultValue ?? ""))
  const hasText = isControlled ? String(value).length > 0 : internal.length > 0

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) setInternal(e.target.value)
    onChange?.(e)
  }

  const handleClear = () => {
    if (isControlled) {
      // 제어 모드 — 상위 onChange 가 e.target.value 만 읽으므로 빈값 이벤트로 상태를 비운다
      onChange?.({ target: { value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>)
    } else if (inputRef.current) {
      inputRef.current.value = ""
      setInternal("")
    }
    inputRef.current?.focus()
    onClear?.()
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        className={cn(hasText && "pr-7")}
        {...props}
      />
      {hasText && !disabled && (
        <button
          type="button"
          aria-label="검색어 지우기"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
          onClick={handleClear}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export { SearchInput }
