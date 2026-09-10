import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { CaretDownIcon, CaretUpIcon, CheckIcon, XIcon } from '@/src/shared/icon';
import { cn } from '@/src/shared/utils/cn';

/**
 * KAISA 드롭다운 — Figma 디자인 시스템 (node 19:14348 트리거 · 19:16946 메뉴 아이템) 기반.
 *
 * active/focused/value/disabled 상태, single/plural 선택, size m/s 스펙을 실제
 * Figma 노드로 확인해 반영. focused(열림)는 트리거 border-primary-400 + CaretUp
 * 전환 + 하단 메뉴 팝오버(dropShadow/s)로 구성된다.
 * 다중 선택 값은 트리거에 최대 2개 칩 + `N+` 칩으로 표시한다.
 */
export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface DropdownProps {
  options: DropdownOption[];
  /** 선택값 — string(단일) | string[](다중). 지정 시 제어 모드 */
  value?: string | string[];
  defaultValue?: string | string[];
  onChange?: (value: string | string[]) => void;
  /** 다중 선택 모드 — 칩 표시 + 선택 후에도 메뉴 유지 */
  multiple?: boolean;
  /** 트리거 위 라벨 — 생략 시 라벨 없는 변형 */
  label?: string;
  /** 필수 표시 — 라벨 옆 빨간 별표 */
  essential?: boolean;
  disabled?: boolean;
  placeholder?: string;
  size?: 'm' | 's';
  className?: string;
}

/** 트리거에 노출할 최대 칩 수 — 나머지는 `N+` 칩으로 묶는다 (Figma plural value) */
const MAX_CHIPS = 2;

const TRIGGER_BASE =
  'flex w-full cursor-pointer items-center rounded-xl border px-4 py-3 transition-[background-color,border-color]';
const TRIGGER_SIZE_S = 'rounded-lg px-3 py-2 text-xs';
const TRIGGER_OPEN = 'border-primary-400 bg-gray-100';
const TRIGGER_CLOSED = 'border-gray-300 bg-gray-100';
const TRIGGER_DISABLED = 'border-gray-300 bg-gray-200 cursor-not-allowed';

const MENU_BASE =
  'absolute cursor-pointer top-full z-10 mt-1 flex max-h-72 w-full flex-col gap-1 overflow-y-auto rounded-xl border border-gray-300 bg-white p-1 shadow-[0_4px_12px_0_rgba(16,24,40,0.1)]';

const ITEM_BASE =
  'flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 font-sans text-base leading-normal tracking-[-0.03em] text-gray-800';
const ITEM_SELECTED = 'bg-primary-50';
const ITEM_HOVER = 'hover:bg-gray-100';
const ITEM_ACTIVE = 'bg-gray-100';
const ITEM_DISABLED = 'bg-gray-200 text-gray-400 cursor-not-allowed';

const CHIP_BASE =
  'flex shrink-0 items-center gap-1 rounded-full border-[0.5px] border-primary-300 bg-primary-100 px-2 py-0.5 font-sans text-xs font-semibold leading-normal tracking-[-0.03em] whitespace-nowrap text-primary-600';

export function Dropdown({
  options,
  value,
  defaultValue,
  onChange,
  multiple = false,
  label,
  essential = false,
  disabled = false,
  placeholder = 'Placeholder',
  size = 'm',
  className,
}: DropdownProps) {
  const fallbackId = useId();
  const triggerId = `dropdown-${fallbackId}`;
  const listId = `${triggerId}-list`;

  const [innerValue, setInnerValue] = useState<string | string[]>(defaultValue ?? '');
  const selection = value ?? innerValue;
  const selectedValues = multiple
    ? Array.isArray(selection)
      ? selection
      : selection
        ? [selection]
        : []
    : Array.isArray(selection)
      ? (selection[0] ?? '')
      : selection;
  const selectedList = Array.isArray(selectedValues)
    ? selectedValues
    : selectedValues
      ? [selectedValues]
      : [];

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  const enabledIndexes = options.reduce<number[]>((acc, option, index) => {
    if (!option.disabled) acc.push(index);
    return acc;
  }, []);

  const labelOf = (optionValue: string) =>
    options.find((option) => option.value === optionValue)?.label ?? optionValue;

  const commit = (next: string | string[]) => {
    if (value === undefined) setInnerValue(next);
    onChange?.(next);
  };

  const selectOption = (option: DropdownOption) => {
    if (disabled || option.disabled) return;
    if (multiple) {
      commit(
        selectedList.includes(option.value)
          ? selectedList.filter((v) => v !== option.value)
          : [...selectedList, option.value],
      );
    } else {
      commit(option.value);
      setOpen(false);
    }
  };

  const removeValue = (removed: string) => {
    if (disabled) return;
    const next = selectedList.filter((v) => v !== removed);
    commit(multiple ? next : (next[0] ?? ''));
  };

  // 열림 상태에서 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const moveActive = (delta: number) => {
    if (enabledIndexes.length === 0) return;
    const count = enabledIndexes.length;
    const position = enabledIndexes.indexOf(activeIndex);
    const offset = position === -1 ? (delta > 0 ? 0 : -1) : position + delta;
    const next = enabledIndexes[(offset + count) % count];
    if (next !== undefined) setActiveIndex(next);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault();
      const activeOption = options[activeIndex];
      if (activeOption) selectOption(activeOption);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const hasSelection = selectedList.length > 0;

  return (
    <div ref={rootRef} className={cn('relative flex w-full flex-col items-start gap-1', className)}>
      {label && (
        <label
          htmlFor={triggerId}
          className={cn(
            'font-sans leading-normal tracking-[-0.03em] whitespace-nowrap text-gray-400',
            size === 's' ? 'text-xs' : 'text-sm',
          )}
        >
          {label}
          {essential && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}

      <button
        type="button"
        id={triggerId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={cn(
          TRIGGER_BASE,
          size === 's' && TRIGGER_SIZE_S,
          open ? TRIGGER_OPEN : TRIGGER_CLOSED,
          disabled && TRIGGER_DISABLED,
          hasSelection && multiple ? 'gap-2' : 'gap-1',
        )}
      >
        {!hasSelection ? (
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-left font-sans leading-normal tracking-[-0.03em]',
              size === 's' ? 'text-xs' : 'text-base',
              open ? 'text-gray-800' : 'text-gray-400',
            )}
          >
            {placeholder}
          </span>
        ) : multiple ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {selectedList.slice(0, MAX_CHIPS).map((selected, index) => (
              <span key={selected} className={cn(CHIP_BASE, index === 1 && 'min-w-0 flex-1')}>
                <span className={index === 1 ? 'truncate' : undefined}>{labelOf(selected)}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`${labelOf(selected)} 선택 해제`}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeValue(selected);
                  }}
                  className="size-3 shrink-0 cursor-pointer text-primary-600"
                >
                  <XIcon />
                </span>
              </span>
            ))}
            {selectedList.length > MAX_CHIPS && (
              <span className={CHIP_BASE}>{selectedList.length - MAX_CHIPS}+</span>
            )}
          </span>
        ) : (
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-left font-sans leading-normal tracking-[-0.03em] text-black',
              size === 's' ? 'text-xs' : 'text-base',
            )}
          >
            {labelOf(selectedList[0] ?? '')}
          </span>
        )}
        <span className="size-3 shrink-0 text-gray-900">
          {open ? <CaretUpIcon /> : <CaretDownIcon />}
        </span>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable={multiple || undefined}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
          className={MENU_BASE}
        >
          {options.map((option, index) => {
            const isSelected = selectedList.includes(option.value);
            return (
              <li
                key={option.value}
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={isSelected || undefined}
                aria-disabled={option.disabled || undefined}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onClick={() => selectOption(option)}
                className={cn(
                  ITEM_BASE,
                  option.disabled
                    ? ITEM_DISABLED
                    : isSelected
                      ? ITEM_SELECTED
                      : index === activeIndex
                        ? ITEM_ACTIVE
                        : ITEM_HOVER,
                )}
              >
                <span className="min-w-0 flex-1 text-left">{option.label}</span>
                {isSelected && (
                  <span
                    className={cn(
                      'size-5 shrink-0',
                      option.disabled ? 'text-gray-400' : 'text-primary-400',
                    )}
                  >
                    <CheckIcon />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
