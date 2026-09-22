import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimerIcon } from "@/src/shared/icon";

import { Chip } from "./chip";

afterEach(cleanup);

describe("Chip", () => {
  it("children 텍스트를 렌더링하고 기본 gray·oval 스타일을 가진다", () => {
    render(<Chip>Badge</Chip>);

    const chip = screen.getByText("Badge");
    expect(chip.className).toContain("bg-gray-200");
    expect(chip.className).toContain("border-gray-400");
    expect(chip.className).toContain("text-gray-700");
    expect(chip.className).toContain("rounded-full");
  });

  it("color별 팔레트를 적용한다", () => {
    render(<Chip color="red">위험</Chip>);

    const chip = screen.getByText("위험");
    expect(chip.className).toContain("bg-red-100");
    expect(chip.className).toContain("border-red-300");
    expect(chip.className).toContain("text-red-500");
  });

  it("lnpGreen은 primary 팔레트를 쓴다", () => {
    render(<Chip color="lnpGreen">LNP</Chip>);

    const chip = screen.getByText("LNP");
    expect(chip.className).toContain("bg-primary-100");
    expect(chip.className).toContain("text-primary-600");
  });

  it("shape square는 4px radius를 쓴다", () => {
    render(<Chip shape="square">사각</Chip>);

    expect(screen.getByText("사각").className).toContain("rounded-[4px]");
  });

  it("size s는 10px Regular, m은 12px SemiBold를 쓴다", () => {
    const { rerender } = render(<Chip size="s">소</Chip>);
    const small = screen.getByText("소");
    expect(small.className).toContain("text-[10px]");
    expect(small.className).toContain("font-normal");

    rerender(<Chip size="m">중</Chip>);
    const medium = screen.getByText("중");
    expect(medium.className).toContain("text-xs");
    expect(medium.className).toContain("font-semibold");
  });

  it("size l은 수직 패딩 4px를 쓴다", () => {
    render(<Chip size="l">대</Chip>);

    expect(screen.getByText("대").className).toContain("py-1");
  });

  it("icon을 렌더링한다", () => {
    render(
      <Chip icon={<TimerIcon />} color="lnpGreen">
        30분
      </Chip>,
    );

    expect(document.querySelector("svg")).toBeTruthy();
    expect(screen.getByText("30분").className).toContain("gap-1");
  });

  it("children 없이 icon만 있으면 onlyIcon 변형(고정 박스)이 된다", () => {
    const { container } = render(<Chip icon={<TimerIcon />} size="m" />);

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("size-[21px]");
    expect(root.className).toContain("p-0.5");
  });

  it("onRemove 지정 시 X 버튼 클릭으로 호출된다", async () => {
    const onRemove = vi.fn();
    render(<Chip onRemove={onRemove}>삭제 대상</Chip>);

    await userEvent.click(
      screen.getByRole("button", { name: "삭제 대상 제거" }),
    );

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("removeLabel로 X 버튼 라벨을 대체한다", () => {
    render(<Chip onRemove={() => {}} removeLabel="필터 해제">서울</Chip>);

    expect(screen.getByRole("button", { name: "필터 해제" })).toBeTruthy();
  });
});
