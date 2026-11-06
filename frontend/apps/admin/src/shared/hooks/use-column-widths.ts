import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type ColumnWidths = Record<string, number>;

/** 드래그로 줄일 수 있는 최소 폭(px) — 헤더 글자가 완전히 사라지지 않게 */
export const MIN_COLUMN_WIDTH = 48;

function load(key: string): ColumnWidths {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    // 손상·구버전 값은 버린다 — 숫자 폭만 인정
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => typeof v === "number" && v >= MIN_COLUMN_WIDTH),
    ) as ColumnWidths;
  } catch {
    // 저장소 접근 불가(사생활 보호 모드 등) — 저장 없이 기본 폭으로 동작
    return {};
  }
}

function save(key: string, widths: ColumnWidths) {
  try {
    if (Object.keys(widths).length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(widths));
  } catch {
    // 저장 실패는 이번 화면에서만 유지되고 끝 — 사용자 작업을 막을 이유가 없다
  }
}

/**
 * 테이블 컬럼 폭 — 이 브라우저(localStorage)에 key 별로 저장한다.
 * 빈 객체면 '사용자 지정 없음'(기본 레이아웃).
 */
export function useColumnWidths(storageKey: string) {
  const [widths, setWidths] = useState<ColumnWidths>(() => load(storageKey));

  // 같은 컴포넌트가 다른 테이블(탭 전환 등)로 바뀌면 그 테이블의 저장값을 읽는다
  useEffect(() => {
    setWidths(load(storageKey));
  }, [storageKey]);

  /** persist=false 는 드래그 중 화면만 갱신 — 손을 뗄 때 한 번 저장한다 */
  const update = useCallback(
    (next: ColumnWidths, persist = true) => {
      setWidths(next);
      if (persist) save(storageKey, next);
    },
    [storageKey],
  );

  const reset = useCallback(() => update({}), [update]);

  return { widths, setWidths: update, reset };
}

/**
 * 헤더 드래그로 열 너비를 조절한다. th 에 thRefs 를 걸고, 핸들 onPointerDown 에 startResize 를 연결.
 * 첫 조절 때 현재 렌더 폭을 전 컬럼에 고정해 레이아웃이 튀지 않게 한다.
 */
export function useColumnResize(columnIds: string[], storageKey: string) {
  const { widths, setWidths, reset } = useColumnWidths(storageKey);
  const customized = Object.keys(widths).length > 0;
  const thRefs = useRef<Record<string, HTMLTableCellElement | null>>({});

  const startResize = (e: ReactPointerEvent, columnId: string) => {
    e.preventDefault(); // 드래그 중 텍스트 선택 방지
    e.stopPropagation();
    // 첫 조절이면 지금 화면에 그려진 폭을 그대로 고정해 두고 시작 — 레이아웃이 튀지 않게
    const base: ColumnWidths = { ...widths };
    if (!customized) {
      for (const id of columnIds) {
        const th = thRefs.current[id];
        if (th) base[id] = Math.max(MIN_COLUMN_WIDTH, Math.round(th.getBoundingClientRect().width));
      }
    }
    const startX = e.clientX;
    const startWidth = base[columnId] ?? MIN_COLUMN_WIDTH;
    let latest = base;
    const onMove = (ev: PointerEvent) => {
      latest = {
        ...base,
        [columnId]: Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + ev.clientX - startX)),
      };
      setWidths(latest, false);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      setWidths(latest);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.style.cursor = "col-resize";
  };

  return { widths, customized, thRefs, startResize, reset };
}
