import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Checkbox } from "./checkbox";

afterEach(cleanup);

/** input → box(체크박스 사각) → check(아이콘 래퍼) → text 순으로 구조 탐색 */
function getParts(name: string) {
  const input = screen.getByRole("checkbox", { name }) as HTMLInputElement;
  const label = input.closest("label") as HTMLElement;
  const box = input.nextElementSibling as HTMLElement;
  const check = box.firstElementChild as HTMLElement;
  const text = box.nextElementSibling as HTMLElement | null;
  return { input, label, box, check, text };
}

describe("Checkbox", () => {
  it("라벨 텍스트와 함께 체크박스 역할로 렌더링된다", () => {
    render(<Checkbox>약관 동의</Checkbox>);

    expect(
      screen.getByRole("checkbox", { name: "약관 동의" }),
    ).toBeTruthy();
  });

  it("기본값은 m — 24px·4px radius·white 배경·gray-300 border", () => {
    render(<Checkbox>약관 동의</Checkbox>);

    const { box } = getParts("약관 동의");
    expect(box.className).toContain("size-6");
    expect(box.className).toContain("rounded-[4px]");
    expect(box.className).toContain("bg-white");
    expect(box.className).toContain("border-gray-300");
  });

  it("size s는 18px 박스·12px 텍스트", () => {
    render(<Checkbox size="s">약관 동의</Checkbox>);

    const { box, text } = getParts("약관 동의");
    expect(box.className).toContain("size-[18px]");
    expect(text?.className).toContain("text-xs");
  });

  it("미선택 disabled는 gray-200 배경 클래스", () => {
    render(<Checkbox disabled>약관 동의</Checkbox>);

    const { input, box } = getParts("약관 동의");
    expect(input.disabled).toBe(true);
    expect(box.className).toContain("group-disabled:bg-gray-200");
    expect(screen.getByText("약관 동의").className).toContain(
      "group-disabled:text-gray-300",
    );
  });

  it("checked면 primary-700 + 흰색 체크 아이콘, checked+disabled는 gray-600", () => {
    render(<Checkbox defaultChecked>약관 동의</Checkbox>);

    const { input, box, check } = getParts("약관 동의");
    expect(input.checked).toBe(true);
    expect(box.className).toContain("group-checked:bg-primary-700");
    expect(check.className).toContain("group-checked:block");
    expect(check.className).toContain("text-white");
    expect(check.querySelector("svg")).toBeTruthy();
    expect(box.className).toContain("group-checked:group-disabled:bg-gray-600");
  });

  it("outline 변형은 카드형 외곽선(m 12px radius·10px gap)을 가진다", () => {
    render(<Checkbox outline>약관 동의</Checkbox>);

    const { label } = getParts("약관 동의");
    expect(label.className).toContain("w-[335px]");
    expect(label.className).toContain("rounded-xl");
    expect(label.className).toContain("gap-2.5");
    expect(label.className).toContain("has-checked:border-primary-400");
  });

  it("outline + size s는 8px radius·6px gap", () => {
    render(
      <Checkbox outline size="s">
        약관 동의
      </Checkbox>,
    );

    const { label } = getParts("약관 동의");
    expect(label.className).toContain("rounded-lg");
    expect(label.className).toContain("gap-1.5");
  });

  it("children 생략 시 인디케이터만 렌더링한다", () => {
    render(<Checkbox aria-label="동의" />);

    const { box } = getParts("동의");
    expect(box.nextElementSibling).toBeNull();
  });

  it("클릭하면 체크 상태가 토글되고 onChange가 호출된다", async () => {
    const onChange = vi.fn();
    render(<Checkbox onChange={onChange}>약관 동의</Checkbox>);

    await userEvent.click(screen.getByText("약관 동의"));

    expect(onChange).toHaveBeenCalledOnce();
    expect(getParts("약관 동의").input.checked).toBe(true);
  });

  it("disabled면 클릭해도 onChange가 호출되지 않는다", async () => {
    const onChange = vi.fn();
    render(
      <Checkbox onChange={onChange} disabled>
        약관 동의
      </Checkbox>,
    );

    await userEvent.click(screen.getByText("약관 동의"));

    expect(onChange).not.toHaveBeenCalled();
  });
});
