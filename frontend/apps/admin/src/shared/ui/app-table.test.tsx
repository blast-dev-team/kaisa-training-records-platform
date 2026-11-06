import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";

import { AppTable } from "./app-table";

interface Row {
  id: string;
  name: string;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "과정명", meta: { width: 200 } },
  { id: "actions", header: "", meta: { width: 100 }, cell: () => "수정" },
];
const data: Row[] = [{ id: "1", name: "안전보건교육" }];

/** 핸들을 잡고 dx 만큼 끈 뒤 놓는다 (happy-dom 은 레이아웃 폭이 0 → 시작 폭은 최소 48px) */
function drag(handle: HTMLElement, dx: number) {
  fireEvent.pointerDown(handle, { clientX: 0 });
  act(() => {
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: dx }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: dx }));
  });
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("AppTable 열 너비 조절", () => {
  it("글자 헤더에는 조절 핸들이 있고, 빈 헤더(액션)에는 없다", () => {
    render(<AppTable columns={columns} data={data} />);
    expect(screen.getAllByRole("separator")).toHaveLength(1);
    expect(screen.getByRole("separator", { name: "과정명 열 너비 조절" })).toBeTruthy();
  });

  it("핸들을 끌면 그 열의 폭이 바뀐다", () => {
    render(<AppTable columns={columns} data={data} />);
    drag(screen.getByRole("separator"), 152);
    const th = screen.getByRole("columnheader", { name: /과정명/ });
    expect(th.style.width).toBe("200px"); // 48(시작) + 152
  });

  it("바꾼 폭은 다시 그려도(새로고침) 유지된다", () => {
    const { unmount } = render(<AppTable columns={columns} data={data} />);
    drag(screen.getByRole("separator"), 252);
    unmount();

    render(<AppTable columns={columns} data={data} />);
    expect(screen.getByRole("columnheader", { name: /과정명/ }).style.width).toBe("300px");
  });

  it("최소 폭 아래로는 줄어들지 않는다", () => {
    render(<AppTable columns={columns} data={data} />);
    drag(screen.getByRole("separator"), -500);
    expect(screen.getByRole("columnheader", { name: /과정명/ }).style.width).toBe("48px");
  });

  it("'열 너비 초기화'를 누르면 선언 폭으로 돌아가고 버튼이 사라진다", () => {
    render(<AppTable columns={columns} data={data} />);
    expect(screen.queryByText("열 너비 초기화")).toBeNull();
    drag(screen.getByRole("separator"), 152);

    fireEvent.click(screen.getByText("열 너비 초기화"));

    expect(screen.getByRole("columnheader", { name: /과정명/ }).style.width).toBe("200px");
    expect(screen.queryByText("열 너비 초기화")).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("컬럼 구성이 다른 테이블은 서로의 폭을 공유하지 않는다", () => {
    const { unmount } = render(<AppTable columns={columns} data={data} />);
    drag(screen.getByRole("separator"), 252);
    unmount();

    const otherColumns: ColumnDef<Row, unknown>[] = [
      { accessorKey: "name", header: "과정명", meta: { width: 200 } },
    ];
    render(<AppTable columns={otherColumns} data={data} />);
    expect(screen.getByRole("columnheader", { name: /과정명/ }).style.width).toBe("200px");
  });
});

describe("AppTable 선택 행 표시", () => {
  const rows: Row[] = [
    { id: "1", name: "선택된 과정" },
    { id: "2", name: "선택 안 된 과정" },
  ];
  const rowOf = (text: string) => screen.getByText(text).closest("tr")!;

  it("선택된 행만 강조색 배경이 된다", () => {
    render(<AppTable columns={columns} data={rows} isRowSelected={(r) => r.id === "1"} />);
    expect(rowOf("선택된 과정").className).toContain("bg-accent-soft");
    expect(rowOf("선택 안 된 과정").className).not.toContain("bg-accent-soft");
  });

  it("선택 표시가 행 강조(getRowClassName)보다 우선한다", () => {
    render(
      <AppTable
        columns={columns}
        data={rows}
        isRowSelected={(r) => r.id === "1"}
        getRowClassName={() => "bg-warn-soft"}
      />,
    );
    expect(rowOf("선택된 과정").className).not.toContain("bg-warn-soft");
    expect(rowOf("선택 안 된 과정").className).toContain("bg-warn-soft");
  });

  it("우측 고정 컬럼 셀도 선택 색을 따른다", () => {
    const stickyCols: ColumnDef<Row, unknown>[] = [
      { accessorKey: "name", header: "과정명" },
      { id: "actions", header: "", meta: { width: 100, sticky: "right" }, cell: () => "수정" },
    ];
    render(<AppTable columns={stickyCols} data={rows} isRowSelected={(r) => r.id === "1"} />);
    const stickyCell = rowOf("선택된 과정").lastElementChild!;
    expect(stickyCell.className).toContain("bg-accent-soft");
    expect(stickyCell.className).not.toContain("bg-panel ");
  });
});
