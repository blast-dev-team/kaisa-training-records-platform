import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Radio } from "./radio";

afterEach(cleanup);

/** input → wrapper(인디케이터 박스) → dot → text 순으로 구조 탐색 */
function getParts(name: string) {
  const input = screen.getByRole("radio", { name }) as HTMLInputElement;
  const label = input.closest("label") as HTMLElement;
  const wrapper = input.nextElementSibling as HTMLElement;
  const dot = wrapper.firstElementChild as HTMLElement;
  const text = wrapper.nextElementSibling as HTMLElement | null;
  return { input, label, wrapper, dot, text };
}

describe("Radio", () => {
  it("라벨 텍스트와 함께 라디오 역할로 렌더링된다", () => {
    render(<Radio name="plan">월간</Radio>);

    expect(screen.getByRole("radio", { name: "월간" })).toBeTruthy();
  });

  it("기본값은 m — 22px 박스·14px 도트·gray-300", () => {
    render(<Radio name="plan">월간</Radio>);

    const { wrapper, dot } = getParts("월간");
    expect(wrapper.className).toContain("size-[22px]");
    expect(dot.className).toContain("size-[14px]");
    expect(dot.className).toContain("bg-gray-300");
    expect(dot.className).toContain("rounded-full");
  });

  it("size s는 18px 박스·10px 도트·12px 텍스트", () => {
    render(
      <Radio name="plan" size="s">
        월간
      </Radio>,
    );

    const { wrapper, dot, text } = getParts("월간");
    expect(wrapper.className).toContain("size-[18px]");
    expect(dot.className).toContain("size-[10px]");
    expect(text?.className).toContain("text-xs");
  });

  it("미선택 텍스트는 gray-800, disabled면 gray-300", () => {
    const { rerender } = render(<Radio name="plan">월간</Radio>);
    const text = screen.getByText("월간");
    expect(text.className).toContain("text-gray-800");

    rerender(
      <Radio name="plan" disabled>
        월간
      </Radio>,
    );
    expect(screen.getByText("월간").className).toContain(
      "group-disabled:text-gray-300",
    );
  });

  it("checked 시 도트가 primary-700, checked+disabled은 gray-500 클래스", () => {
    render(
      <Radio name="plan" defaultChecked>
        월간
      </Radio>,
    );

    const { input, dot } = getParts("월간");
    expect(input.checked).toBe(true);
    expect(dot.className).toContain("group-checked:bg-primary-700");
    expect(dot.className).toContain("group-checked:group-disabled:bg-gray-500");
  });

  it("outline 변형은 카드형 외곽선을 가진다", () => {
    render(
      <Radio name="plan" outline>
        월간
      </Radio>,
    );

    const { label } = getParts("월간");
    expect(label.className).toContain("w-[335px]");
    expect(label.className).toContain("rounded-xl");
    expect(label.className).toContain("border-gray-300");
    expect(label.className).toContain("has-checked:border-primary-400");
  });

  it("outline + size s는 8px radius·8px padding", () => {
    render(
      <Radio name="plan" outline size="s">
        월간
      </Radio>,
    );

    const { label } = getParts("월간");
    expect(label.className).toContain("rounded-lg");
    expect(label.className).toContain("p-2");
  });

  it("children 생략 시 인디케이터만 렌더링한다", () => {
    render(<Radio name="plan" aria-label="옵션" />);

    const { input, wrapper } = getParts("옵션");
    expect(input.nextElementSibling).toBe(wrapper);
    expect(wrapper.nextElementSibling).toBeNull();
  });

  it("클릭하면 onChange가 호출된다", async () => {
    const onChange = vi.fn();
    render(
      <Radio name="plan" onChange={onChange}>
        월간
      </Radio>,
    );

    await userEvent.click(screen.getByText("월간"));

    expect(onChange).toHaveBeenCalledOnce();
  });

  it("disabled면 클릭해도 onChange가 호출되지 않는다", async () => {
    const onChange = vi.fn();
    render(
      <Radio name="plan" onChange={onChange} disabled>
        월간
      </Radio>,
    );

    await userEvent.click(screen.getByText("월간"));

    expect(onChange).not.toHaveBeenCalled();
  });
});
