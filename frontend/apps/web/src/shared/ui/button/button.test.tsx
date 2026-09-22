import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import { Button } from "./button";

describe("Button", () => {
  it("children을 버튼 텍스트로 렌더링한다", () => {
    render(<Button>저장하기</Button>);

    expect(screen.getByRole("button", { name: "저장하기" })).toBeTruthy();
  });

  it("outlined 변형이 color 토큰 클래스를 적용한다", () => {
    render(
      <Button variant="outlined" color="primary">
        확인
      </Button>,
    );

    const button = screen.getByRole("button");
    expect(button.className).toContain("border-primary-400");
    expect(button.className).toContain("text-primary-400");
  });

  it("disabled면 비활성 스타일이 적용된다", () => {
    render(<Button disabled>완료</Button>);

    const button = screen.getByRole("button", { name: "완료" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.className).toContain("disabled:bg-gray-300");
    expect(button.className).toContain("disabled:text-white");
  });

  it("iconOnly면 정사각 패딩 클래스를 적용한다", () => {
    render(
      <Button iconOnly size="l" leftIcon={<svg />}>
        <span>숨김</span>
      </Button>,
    );

    // iconOnly에서는 children을 렌더링하지 않는다
    expect(screen.queryByText("숨김")).toBeNull();
    expect(screen.getByRole("button").className).toContain("size-14");
  });
});
