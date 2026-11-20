/**
 * P15-3: 종료일(ended_at)만 없는 이력 — toItem 이 endedOn 을 startedOn 으로 채워
 * 페이지의 "수강 기간 없는 이력 잠금"(rowCategory) 이 무력화된다. 서버 게이트는
 * ended_at None 이면 400 (request_service._validate_item).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TrainingHistoryPage } from "@/src/views/training-history/ui/training-history-page";

describe("P15-3 started-only record stays checkable", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("ended_at 이 없는 이력은 체크박스가 잠겨야 한다", async () => {
    const item = {
      id: "r1", started_at: "2026-03-01", ended_at: null, course_name: "종료일없음",
      institution_name: "KAISA", total_hours: "8", certificate_status: "issuable",
      institution_type: "internal", completion_status: "completed", is_demo: false,
    };
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ items: [item], total: 1, page: 1, limit: 10, total_pages: 1, total_hours_sum: 8 }),
        { status: 200, headers: { "Content-Type": "application/json" } })));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/training-history?period=all"]}>
          <TrainingHistoryPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const box = (await waitFor(() => screen.getByLabelText("종료일없음 선택"))) as HTMLInputElement;
    expect(box.disabled).toBe(true);
  });
});
