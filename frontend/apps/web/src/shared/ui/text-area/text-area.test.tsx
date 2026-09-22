import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TextArea } from "./text-area";

afterEach(cleanup);

describe("TextArea", () => {
  it("label과 helperText를 렌더링하고 라벨이 textarea와 연결된다", () => {
    render(<TextArea label="소개" helperText="Helper text" />);

    expect(screen.getByLabelText("소개")).toBeTruthy();
    expect(screen.getByText("Helper text")).toBeTruthy();
  });

  it("label을 생략하면 라벨 없는 변형으로 렌더링한다", () => {
    render(<TextArea placeholder="내용을 입력하세요" />);

    expect(screen.queryByLabelText(/./)).toBeNull();
    expect(screen.getByPlaceholderText("내용을 입력하세요")).toBeTruthy();
  });

  it("essential이면 라벨 옆에 필수 표시를 렌더링한다", () => {
    render(<TextArea label="소개" essential />);

    expect(screen.getByText("*")).toBeTruthy();
  });

  it("error면 에러 토큰 클래스를 적용한다", () => {
    render(<TextArea label="소개" helperText="형식을 확인해 주세요" error />);

    const textarea = screen.getByLabelText("소개");
    expect(textarea.className).toContain("text-red-500");
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("형식을 확인해 주세요").className).toContain(
      "text-red-500",
    );
  });

  it("disabled면 textarea가 비활성화된다", () => {
    render(<TextArea label="소개" disabled />);

    const textarea = screen.getByLabelText("소개") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
  });

  it("letterLimit을 지정하면 글자수 카운터가 입력에 따라 갱신된다", async () => {
    render(<TextArea label="소개" letterLimit={300} />);

    expect(screen.getByText("0 / 300")).toBeTruthy();

    await userEvent.type(screen.getByLabelText("소개"), "ab");

    expect(screen.getByText("2 / 300")).toBeTruthy();
  });

  it("제어 모드에서는 value 기준으로 카운터를 계산한다", () => {
    render(<TextArea label="소개" letterLimit={10} value="abc" readOnly />);

    expect(screen.getByText("3 / 10")).toBeTruthy();
  });

  it("letterLimit을 생략하면 카운터가 렌더링되지 않는다", () => {
    render(<TextArea label="소개" />);

    expect(screen.queryByText(/\/ \d+$/)).toBeNull();
  });

  it("값을 입력하면 onChange가 호출된다", async () => {
    const handleChange = vi.fn();
    render(<TextArea label="소개" onChange={handleChange} />);

    await userEvent.type(screen.getByLabelText("소개"), "a");

    expect(handleChange).toHaveBeenCalled();
  });
});
