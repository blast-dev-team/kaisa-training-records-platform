import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { DateField } from "./date-field";

afterEach(cleanup);

function renderInScrollBox() {
  render(
    <div data-testid="scroll-box" style={{ overflowY: "auto", maxHeight: 200 }}>
      <DateField ariaLabel="종료일" value="2026-10-16" onChange={() => {}} />
    </div>,
  );
  fireEvent.click(screen.getByRole("button", { name: "달력 열기" }));
}

describe("DateField 팝오버", () => {
  it("달력은 모달 스크롤 영역 밖(body)에 그려진다", () => {
    renderInScrollBox();
    const popover = screen.getByRole("button", { name: "이전 달" });

    expect(screen.getByTestId("scroll-box").contains(popover)).toBe(false);
  });

  it("달력 안을 누르면 닫히지 않는다", () => {
    renderInScrollBox();
    fireEvent.mouseDown(screen.getByRole("button", { name: "이전 달" }));

    expect(screen.queryByRole("button", { name: "이전 달" })).not.toBeNull();
  });

  it("바깥을 누르면 닫힌다", () => {
    renderInScrollBox();
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("button", { name: "이전 달" })).toBeNull();
  });
});
