import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { evaluateExternalCap, type ExternalHoursSummary } from "@/src/entities/training-record";
import { ExternalHoursNotice } from "./external-hours-notice";

afterEach(cleanup);

const summary = (externalHours: number): ExternalHoursSummary => ({
  windowStart: "2023-11-10",
  externalHours,
  maxHours: 16,
  remainingHours: Math.max(0, 16 - externalHours),
});

const renderNotice = (current: number, hours: number, isExternal = true) => {
  const s = summary(current);
  render(
    <ExternalHoursNotice
      summary={s}
      result={evaluateExternalCap({ summary: s, isExternal, startedAt: "2026-10-01", hours })}
      isExternal={isExternal}
    />,
  );
};

describe("ExternalHoursNotice", () => {
  it("한도를 넘으면 이미 등록된 시간과 함께 등록 불가를 알린다", () => {
    renderNotice(15, 2);
    expect(screen.getByRole("alert").textContent).toBe(
      "이미 최근 3년 내 등록된 외부교육이 15시간이라 등록할 수 없어요 (최대 16시간, 남은 한도 1시간)",
    );
  });

  it("한도 안이면 등록된 시간과 남은 한도를 안내한다", () => {
    renderNotice(10, 4);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/최근 3년 외부교육 10시간 등록됨 · 6시간 더 등록할 수 있어요/)).toBeTruthy();
  });

  it("사내 기관이면 아무것도 보이지 않는다", () => {
    const { container } = render(
      <ExternalHoursNotice summary={summary(20)} result={null} isExternal={false} />,
    );
    expect(container.textContent).toBe("");
  });
});
