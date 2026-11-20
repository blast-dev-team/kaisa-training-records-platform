/**
 * P15-1: 선택 카테고리가 비어 있을 때 '전체 선택'이 issuable 행과 completionOnly(3년 초과
 * 내부 수료) 행을 함께 선택해, 발급(유료) 버튼이 3년 초과 이력을 포함한 채 활성화된다.
 * 표 docstring: "선택 카테고리가 다른 행(발급 vs 수료증 혼합 방지)은 체크박스가 잠긴다".
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TrainingHistoryPage } from "@/src/views/training-history/ui/training-history-page";

const rec = (id: string, name: string, started: string, status: string) => ({
  id,
  started_at: started,
  ended_at: started,
  course_name: name,
  institution_name: "KAISA",
  total_hours: "8",
  certificate_status: status,
  institution_type: "internal",
  completion_status: "completed",
  is_demo: false,
});

describe("P15-1 select-all mixes issuable + completionOnly", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("전체 선택은 첫 행 카테고리(issuable)와 다른 행을 선택하지 않아야 한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [
              rec("r-new", "최근교육", "2026-03-01", "issuable"),
              rec("r-old", "오래된교육", "2020-01-01", "unavailable"),
            ],
            total: 2, page: 1, limit: 10, total_pages: 1, total_hours_sum: 16,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/training-history?period=all"]}>
          <TrainingHistoryPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => screen.getByLabelText("최근교육 선택"));
    fireEvent.click(screen.getByLabelText("전체 선택"));

    const issueBtn = screen.getByRole("button", { name: "발급" }) as HTMLButtonElement;
    const oldBox = screen.getByLabelText("오래된교육 선택") as HTMLInputElement;
    // 기대: 3년 초과(unavailable) 행은 유료 발급 선택에 섞이지 않는다
    expect({ issueEnabled: !issueBtn.disabled, oldSelected: oldBox.checked }).toEqual({
      issueEnabled: true,
      oldSelected: false,
    });
  });
});
