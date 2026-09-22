import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Slider } from "./slider";

afterEach(cleanup);

const getRadio = (name: string) =>
  screen.getByRole("radio", { name }) as HTMLElement;

/** radiogroup 안 세그먼트(채움 바)들을 순서대로 반환 */
const getSegments = () =>
  Array.from(
    screen
      .getByRole("radiogroup")
      .querySelectorAll(":scope > div > div:first-child"),
  ) as HTMLElement[];

describe("Slider", () => {
  it("스톱 3개(radio)를 렌더한다", () => {
    render(<Slider />);
    expect(screen.getByRole("radio", { name: "1단계" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "2단계" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "3단계" })).toBeTruthy();
  });

  it("기본 level 1 — 세그먼트 전부 미방문, 나머지 도트 gray", () => {
    render(<Slider />);
    expect(getRadio("1단계").getAttribute("aria-checked")).toBe("true");
    const segs = getSegments();
    expect(segs[0]?.className).toContain("bg-gray-100");
    expect(segs[1]?.className).toContain("bg-gray-100");
    expect(getRadio("2단계").querySelector("span")?.className).toContain(
      "bg-gray-300",
    );
  });

  it("level 2 — 첫 세그먼트만 채움, 스톱1은 방문 도트(흰색)", () => {
    render(<Slider level={2} />);
    expect(getRadio("2단계").getAttribute("aria-checked")).toBe("true");
    const segs = getSegments();
    expect(segs[0]?.className).toContain("bg-primary-700");
    expect(segs[1]?.className).toContain("bg-gray-100");
    expect(getRadio("1단계").querySelector("span")?.className).toContain(
      "bg-white",
    );
    expect(getRadio("3단계").querySelector("span")?.className).toContain(
      "bg-gray-300",
    );
  });

  it("level 3 — 세그먼트 전부 채움, 스톱 1·2 방문 도트", () => {
    render(<Slider level={3} />);
    const segs = getSegments();
    expect(segs[0]?.className).toContain("bg-primary-700");
    expect(segs[1]?.className).toContain("bg-primary-700");
    expect(getRadio("1단계").querySelector("span")?.className).toContain(
      "bg-white",
    );
    expect(getRadio("2단계").querySelector("span")?.className).toContain(
      "bg-white",
    );
  });

  it("활성 핸들 — 흰 원 + shadow + 포커스 링 클래스", () => {
    render(<Slider level={2} />);
    const handle = getRadio("2단계").querySelector("span > span");
    expect(handle?.className).toContain("bg-white");
    expect(handle?.className).toContain("shadow-[0_4px_12px_0_rgba(16,24,40,0.1)]");
    expect(handle?.className).toContain("group-focus-visible:outline-primary-400");
  });

  it("leftText/rightText 라벨 행을 렌더한다", () => {
    render(<Slider level={1} leftText="Weak" rightText="Strong" />);
    expect(screen.getByText("Weak")).toBeTruthy();
    expect(screen.getByText("Strong")).toBeTruthy();
  });

  it("라벨 미지정 시 라벨 행이 없다", () => {
    render(<Slider />);
    expect(screen.getByRole("radiogroup").parentElement?.children.length).toBe(
      1,
    );
  });

  it("valueText 말풍선 — 활성 스톱에만, 포커스 전 hidden", () => {
    render(<Slider level={2} valueText="Value" />);
    const bubble = screen.getByText("Value");
    expect(bubble.className).toContain("hidden");
    expect(bubble.className).toContain("group-focus-visible:block");
    expect(getRadio("1단계").textContent).not.toContain("Value");
  });

  it("스톱 클릭 시 onLevelChange를 호출한다", async () => {
    const onLevelChange = vi.fn();
    render(<Slider level={1} onLevelChange={onLevelChange} />);
    await userEvent.click(getRadio("3단계"));
    expect(onLevelChange).toHaveBeenCalledWith(3);
  });

  it("비제어 모드 — 클릭으로 활성 스톱이 이동한다", async () => {
    render(<Slider defaultLevel={1} />);
    expect(getRadio("1단계").getAttribute("aria-checked")).toBe("true");
    await userEvent.click(getRadio("2단계"));
    expect(getRadio("2단계").getAttribute("aria-checked")).toBe("true");
  });

  it("className을 루트에 병합한다", () => {
    render(<Slider className="mt-4" />);
    expect(
      screen.getByRole("radiogroup").parentElement?.className,
    ).toContain("mt-4");
  });
});
