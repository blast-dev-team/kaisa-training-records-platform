import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { rangeBetween, useShiftRangeSelect } from "./use-shift-range-select";

const I1 = { id: "1", blocked: false };
const I2 = { id: "2", blocked: false };
const I3 = { id: "3", blocked: true };
const I4 = { id: "4", blocked: false };
const I5 = { id: "5", blocked: false };
const items = [I1, I2, I3, I4, I5];
const keyOf = (item: { id: string }) => item.id;
const ids = (list: { id: string }[]) => list.map((item) => item.id);

describe("rangeBetween", () => {
  it("1번 → 5번이면 1~5", () => {
    expect(ids(rangeBetween(items, keyOf, "1", "5"))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("거꾸로 5번 → 2번도 2~5", () => {
    expect(ids(rangeBetween(items, keyOf, "5", "2"))).toEqual(["2", "3", "4", "5"]);
  });

  it("선택할 수 없는 행은 건너뛴다", () => {
    expect(ids(rangeBetween(items, keyOf, "1", "5", (i) => !i.blocked))).toEqual([
      "1",
      "2",
      "4",
      "5",
    ]);
  });

  it("기준 행이 목록에 없으면(페이지 이동 등) 누른 행만", () => {
    expect(ids(rangeBetween(items, keyOf, "다른페이지", "4"))).toEqual(["4"]);
  });
});

describe("useShiftRangeSelect", () => {
  const press = (shiftKey: boolean) =>
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey }));
    });
  const release = () =>
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", shiftKey: false }));
    });

  it("Shift 없이 누르면 그 행만", () => {
    const { result } = renderHook(() => useShiftRangeSelect({ items, getKey: keyOf }));
    expect(ids(result.current.pick(I1))).toEqual(["1"]);
    expect(ids(result.current.pick(I5))).toEqual(["5"]);
  });

  it("1번 누르고 Shift+5번이면 1~5", () => {
    const { result } = renderHook(() => useShiftRangeSelect({ items, getKey: keyOf }));
    result.current.pick(I1);
    press(true);
    expect(ids(result.current.pick(I5))).toEqual(["1", "2", "3", "4", "5"]);
    release();
  });

  it("Shift 를 떼면 다시 한 행씩", () => {
    const { result } = renderHook(() => useShiftRangeSelect({ items, getKey: keyOf }));
    result.current.pick(I1);
    press(true);
    result.current.pick(I3);
    release();
    expect(ids(result.current.pick(I5))).toEqual(["5"]);
  });

  it("범위가 끝난 행이 다음 기준이 된다 (1 → Shift 3 → Shift 5 = 3~5)", () => {
    const { result } = renderHook(() => useShiftRangeSelect({ items, getKey: keyOf }));
    result.current.pick(I1);
    press(true);
    result.current.pick(I3);
    expect(ids(result.current.pick(I5))).toEqual(["3", "4", "5"]);
    release();
  });

  it("처음 누른 게 Shift+클릭이면 그 행만", () => {
    const { result } = renderHook(() => useShiftRangeSelect({ items, getKey: keyOf }));
    press(true);
    expect(ids(result.current.pick(I4))).toEqual(["4"]);
    release();
  });
});
