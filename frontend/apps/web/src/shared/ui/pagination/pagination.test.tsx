import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./pagination";

afterEach(cleanup);

const getNav = () => screen.getByRole("navigation") as HTMLElement;

describe("Pagination", () => {
  it("totalPages만큼 숫자 버튼을 렌더한다", () => {
    render(<Pagination page={1} totalPages={5} />);
    [1, 2, 3, 4, 5].forEach((n) => {
      expect(screen.getByRole("button", { name: String(n) })).toBeTruthy();
    });
  });

  it("현재 페이지에 aria-current와 활성 스타일", () => {
    render(<Pagination page={3} totalPages={5} />);
    const active = screen.getByRole("button", { name: "3" });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.className).toContain("bg-primary-700");
    expect(active.className).toContain("text-white");
    const inactive = screen.getByRole("button", { name: "1" });
    expect(inactive.getAttribute("aria-current")).toBeNull();
    expect(inactive.className).toContain("text-gray-400");
  });

  it("캐럿 버튼 4종을 렌더한다", () => {
    render(<Pagination page={2} totalPages={5} />);
    expect(screen.getByRole("button", { name: "첫 페이지" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "이전 페이지" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다음 페이지" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "마지막 페이지" })).toBeTruthy();
  });

  it("첫 페이지에서 first/prev 비활성화", () => {
    render(<Pagination page={1} totalPages={5} />);
    expect(
      (screen.getByRole("button", { name: "첫 페이지" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "이전 페이지" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "다음 페이지" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("마지막 페이지에서 next/last 비활성화", () => {
    render(<Pagination page={5} totalPages={5} />);
    expect(
      (screen.getByRole("button", { name: "다음 페이지" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "마지막 페이지" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("숫자 버튼 클릭 시 onChange를 호출한다", async () => {
    const onChange = vi.fn();
    render(<Pagination page={1} totalPages={5} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "4" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("다음/마지막 버튼 클릭으로 페이지 이동", async () => {
    const onChange = vi.fn();
    render(<Pagination page={1} totalPages={5} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    expect(onChange).toHaveBeenCalledWith(2);
    await userEvent.click(
      screen.getByRole("button", { name: "마지막 페이지" }),
    );
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("비활성 캐럿 클릭 시 onChange 미호출", async () => {
    const onChange = vi.fn();
    render(<Pagination page={1} totalPages={5} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "이전 페이지" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("현재 페이지 재클릭 시 onChange 미호출", async () => {
    const onChange = vi.fn();
    render(<Pagination page={2} totalPages={5} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("limitOptions 미지정 — 셀렉터 없음, gap 레이아웃", () => {
    render(<Pagination page={1} totalPages={5} />);
    expect(screen.queryByText("10개씩 보기")).toBeNull();
    expect(getNav().className).toContain("gap-2");
    expect(getNav().className).not.toContain("w-[736px]");
  });

  it("limitOptions 지정 — 셀렉터 + w-[736px] justify-between", () => {
    render(
      <Pagination
        page={1}
        totalPages={5}
        limitOptions={[10, 20, 30]}
        limit={10}
      />,
    );
    expect(screen.getByText("10개씩 보기")).toBeTruthy();
    expect(getNav().className).toContain("w-[736px]");
    expect(getNav().className).toContain("justify-between");
  });

  it("목록 수 변경 시 onLimitChange를 호출한다", async () => {
    const onLimitChange = vi.fn();
    render(
      <Pagination
        page={1}
        totalPages={5}
        limitOptions={[10, 20, 30]}
        limit={10}
        onLimitChange={onLimitChange}
      />,
    );
    await userEvent.click(screen.getByText("10개씩 보기"));
    await userEvent.click(screen.getByRole("option", { name: "20개씩 보기" }));
    expect(onLimitChange).toHaveBeenCalledWith(20);
  });

  it("className을 nav에 병합한다", () => {
    render(<Pagination page={1} totalPages={5} className="mt-6" />);
    expect(getNav().className).toContain("mt-6");
  });
});
