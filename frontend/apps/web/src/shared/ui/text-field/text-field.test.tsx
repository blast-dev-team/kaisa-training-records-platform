import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TextField } from "./text-field";

afterEach(cleanup);

describe("TextField", () => {
  it("label과 helperText를 렌더링하고 라벨이 input과 연결된다", () => {
    render(<TextField label="이메일" helperText="Helper text" />);

    expect(screen.getByLabelText("이메일")).toBeTruthy();
    expect(screen.getByText("Helper text")).toBeTruthy();
  });

  it("label을 생략하면 라벨 없는 변형으로 렌더링한다", () => {
    render(<TextField placeholder="닉네임" />);

    expect(screen.queryByLabelText(/./)).toBeNull();
    expect(screen.getByPlaceholderText("닉네임")).toBeTruthy();
  });

  it("essential이면 라벨 옆에 필수 표시를 렌더링한다", () => {
    render(<TextField label="이름" essential />);

    expect(screen.getByText("*")).toBeTruthy();
  });

  it("error면 에러 토큰 클래스를 적용한다", () => {
    render(<TextField label="이메일" helperText="형식을 확인해 주세요" error />);

    const input = screen.getByLabelText("이메일");
    expect(input.className).toContain("text-red-500");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("형식을 확인해 주세요").className).toContain(
      "text-red-500",
    );
  });

  it("disabled면 input이 비활성화된다", () => {
    render(<TextField label="이메일" disabled />);

    const input = screen.getByLabelText("이메일") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it("rightIcon을 입력창 안에 렌더링한다", () => {
    render(<TextField rightIcon={<svg data-testid="icon" />} />);

    expect(screen.getByTestId("icon")).toBeTruthy();
  });

  it("값을 입력하면 onChange가 호출된다", async () => {
    const handleChange = vi.fn();
    render(<TextField label="이메일" onChange={handleChange} />);

    await userEvent.type(screen.getByLabelText("이메일"), "a");

    expect(handleChange).toHaveBeenCalled();
  });
});
