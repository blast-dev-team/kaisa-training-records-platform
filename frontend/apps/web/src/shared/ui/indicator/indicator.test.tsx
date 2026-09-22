import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Indicator } from "./indicator";

afterEach(cleanup);

describe("Indicator", () => {
  it("도트 5개를 렌더한다", () => {
    render(<Indicator order={3} />);
    const img = screen.getByRole("img", { name: "5단계 중 3단계" });
    expect(img.children.length).toBe(5);
  });

  it("order 위치 도트만 활성 스타일이다", () => {
    render(<Indicator order={2} />);
    const img = screen.getByRole("img") as HTMLElement;
    const dots = Array.from(img.children) as HTMLElement[];
    expect(dots[1]?.className).toContain("bg-primary-400");
    expect(dots[0]?.className).toContain("bg-gray-200");
    expect(dots[2]?.className).toContain("bg-gray-200");
    expect(dots[3]?.className).toContain("bg-gray-200");
    expect(dots[4]?.className).toContain("bg-gray-200");
  });

  it("활성 도트는 흰 테두리, 비활성은 테두리 없다", () => {
    render(<Indicator order={5} />);
    const img = screen.getByRole("img") as HTMLElement;
    const dots = Array.from(img.children) as HTMLElement[];
    expect(dots[4]?.className).toContain("border-white");
    expect(dots[0]?.className).not.toContain("border");
  });

  it("도트 크기 — 활성 11px, 비활성 8px", () => {
    render(<Indicator order={1} />);
    const img = screen.getByRole("img") as HTMLElement;
    const dots = Array.from(img.children) as HTMLElement[];
    expect(dots[0]?.className).toContain("size-[11px]");
    expect(dots[1]?.className).toContain("size-2");
  });

  it("className을 루트에 병합한다", () => {
    render(<Indicator order={1} className="mt-4" />);
    const img = screen.getByRole("img") as HTMLElement;
    expect(img.className).toContain("mt-4");
  });
});
