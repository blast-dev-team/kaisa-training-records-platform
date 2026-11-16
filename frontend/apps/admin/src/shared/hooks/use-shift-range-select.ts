import { useCallback, useEffect, useRef, type MouseEvent } from "react";

/**
 * 기준 행(anchor)부터 지금 누른 행까지 — 화면에 보이는 순서 그대로, 양 끝 포함.
 * 선택할 수 없는 행(canSelect=false)은 건너뛴다. 기준 행이 목록에 없으면 누른 행만.
 */
export function rangeBetween<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  anchorKey: string | null,
  key: string,
  canSelect: (item: T) => boolean = () => true,
): T[] {
  const end = items.findIndex((item) => getKey(item) === key);
  const start = anchorKey === null ? -1 : items.findIndex((item) => getKey(item) === anchorKey);
  const clicked = items[end];
  if (clicked === undefined) return [];
  if (start === -1) return [clicked];
  const [from, to] = start <= end ? [start, end] : [end, start];
  return items.slice(from, to + 1).filter(canSelect);
}

interface Options<T> {
  /** 지금 화면에 보이는 행 — 범위는 이 순서로 계산한다 */
  items: readonly T[];
  getKey: (item: T) => string;
  /** 체크할 수 없는 행 — 범위에서 뺀다 */
  canSelect?: (item: T) => boolean;
}

/**
 * Shift+클릭 범위 선택 — 1번을 누르고 Shift 를 누른 채 5번을 누르면 1~5번이 같은 상태가 된다.
 *
 * `pick(item)` 이 이번 클릭으로 바꿀 행 목록을 돌려준다(Shift 가 아니면 누른 행 하나).
 * 호출한 쪽이 누른 행의 새 체크 상태를 그 목록 전체에 적용한다 — 선택·해제 모두 같은 방식.
 * Shift 상태는 키보드 이벤트로 추적한다: 체크박스 onChange·label 클릭에는 shiftKey 가
 * 실리지 않는 경우가 있어서다.
 */
export function useShiftRangeSelect<T>({ items, getKey, canSelect }: Options<T>) {
  const anchorRef = useRef<string | null>(null);
  const shiftRef = useRef(false);
  const latest = useRef({ items, getKey, canSelect });
  latest.current = { items, getKey, canSelect };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      shiftRef.current = e.shiftKey;
    };
    const reset = () => {
      shiftRef.current = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", reset);
    };
  }, []);

  const pick = useCallback((item: T): T[] => {
    const { items: list, getKey: keyOf, canSelect: selectable } = latest.current;
    const key = keyOf(item);
    const targets =
      shiftRef.current && anchorRef.current !== null && anchorRef.current !== key
        ? rangeBetween(list, keyOf, anchorRef.current, key, selectable)
        : [item];
    anchorRef.current = key;
    // Shift+클릭이 만든 글자 드래그 선택(파란 하이라이트)을 지운다
    if (targets.length > 1) window.getSelection()?.removeAllRanges();
    return targets.length > 0 ? targets : [item];
  }, []);

  return { pick };
}

/**
 * 브라우저는 Shift+클릭한 label 을 안쪽 체크박스로 넘기지 않는다(글자 범위 선택으로 처리).
 * label 로 감싼 커스텀 체크박스에서도 Shift 범위 선택이 되도록 그 클릭을 체크박스로 직접 넘긴다.
 */
export function forwardShiftClickToCheckbox(e: MouseEvent<HTMLLabelElement>) {
  if (!e.shiftKey) return;
  const input = e.currentTarget.querySelector("input");
  if (!input || input.disabled || e.target === input) return;
  e.preventDefault();
  input.click();
}
