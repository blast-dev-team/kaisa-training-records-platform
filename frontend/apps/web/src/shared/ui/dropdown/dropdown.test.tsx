import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dropdown } from "./dropdown";

const OPTIONS = [
  { value: "apple", label: "사과" },
  { value: "banana", label: "바나나" },
  { value: "cherry", label: "체리" },
];

afterEach(cleanup);

describe("Dropdown", () => {
  it("label을 렌더링하고 트리거 클릭으로 메뉴를 연다", async () => {
    render(<Dropdown label="과일" options={OPTIONS} />);

    expect(screen.getByText("과일")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /과일|placeholder/i }));

    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByRole("option", { name: "사과" })).toBeTruthy();
  });

  it("단일 선택: 옵션 클릭 시 onChange 호출 후 메뉴가 닫힌다", async () => {
    const handleChange = vi.fn();
    render(<Dropdown label="과일" options={OPTIONS} onChange={handleChange} />);

    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(screen.getByRole("option", { name: "바나나" }));

    expect(handleChange).toHaveBeenCalledWith("banana");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByText("바나나")).toBeTruthy();
  });

  it("다중 선택: 3개 선택 시 칩 2개 + N+ 칩을 렌더링한다", async () => {
    const handleChange = vi.fn();
    render(
      <Dropdown label="과일" options={OPTIONS} multiple onChange={handleChange} />,
    );

    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(screen.getByRole("option", { name: "사과" }));
    await userEvent.click(screen.getByRole("option", { name: "바나나" }));
    await userEvent.click(screen.getByRole("option", { name: "체리" }));

    expect(handleChange).toHaveBeenLastCalledWith(["apple", "banana", "cherry"]);
    expect(screen.getByText("1+")).toBeTruthy();
    // 다중 선택은 메뉴를 유지한다
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("칩의 X 클릭으로 선택을 해제한다", async () => {
    const handleChange = vi.fn();
    render(
      <Dropdown
        label="과일"
        options={OPTIONS}
        multiple
        defaultValue={["apple", "banana"]}
        onChange={handleChange}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /사과 선택 해제/ }),
    );

    expect(handleChange).toHaveBeenCalledWith(["banana"]);
  });

  it("disabled 옵션은 선택되지 않고 비활성 스타일을 가진다", async () => {
    const handleChange = vi.fn();
    render(
      <Dropdown
        label="과일"
        options={[...OPTIONS, { value: "mango", label: "망고", disabled: true }]}
        onChange={handleChange}
      />,
    );

    await userEvent.click(screen.getByRole("button"));
    const mango = screen.getByRole("option", { name: "망고" });
    await userEvent.click(mango);

    expect(handleChange).not.toHaveBeenCalled();
    expect(mango.className).toContain("bg-gray-200");
    expect(mango.getAttribute("aria-disabled")).toBe("true");
  });

  it("disabled면 트리거가 비활성화되어 메뉴가 열리지 않는다", async () => {
    render(<Dropdown label="과일" options={OPTIONS} disabled />);

    const trigger = screen.getByRole("button") as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);

    trigger.click();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("메뉴 바깥 클릭 시 닫힌다", async () => {
    render(
      <div>
        <Dropdown label="과일" options={OPTIONS} />
        <button type="button">바깥</button>
      </div>,
    );

    await userEvent.click(screen.getByRole("button", { name: /과일|placeholder/i }));
    expect(screen.getByRole("listbox")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "바깥" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("키보드로 화살표 이동 후 Enter로 선택한다", async () => {
    const handleChange = vi.fn();
    render(<Dropdown label="과일" options={OPTIONS} onChange={handleChange} />);

    const trigger = screen.getByRole("button");
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(handleChange).toHaveBeenCalledWith("apple");
  });

  it("Escape로 메뉴를 닫는다", async () => {
    render(<Dropdown label="과일" options={OPTIONS} />);

    await userEvent.click(screen.getByRole("button"));
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("선택된 옵션에 selected 스타일과 체크 아이콘을 표시한다", async () => {
    render(<Dropdown label="과일" options={OPTIONS} defaultValue="cherry" />);

    expect(screen.getByText("체리")).toBeTruthy();

    await userEvent.click(screen.getByRole("button"));
    const cherry = screen.getByRole("option", { name: "체리" });

    expect(cherry.className).toContain("bg-primary-50");
    expect(cherry.getAttribute("aria-selected")).toBe("true");
  });

  it("essential이면 라벨 옆에 필수 표시를 렌더링한다", () => {
    render(<Dropdown label="과일" options={OPTIONS} essential />);

    expect(screen.getByText("*")).toBeTruthy();
  });
});
