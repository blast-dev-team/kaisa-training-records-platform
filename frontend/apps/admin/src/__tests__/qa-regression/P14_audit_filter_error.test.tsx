// P14-6: 감사로그 필터 요청이 실패(예: 엔티티 ID 가 UUID 아님 → BE 422)해도 화면이 오류 안내 없이 "불러오는 중..." 에 멈춘다 (가설 수정: 이전 결과 유지는 아님)
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

const row = { id: "l1", actorAdminId: "a1", actorName: "김관리", action: "trainee.updated", entityType: "trainee",
  entityId: "11111111-1111-1111-1111-111111111111", before: null, after: { name: "x" }, createdAt: "2026-11-01T00:00:00Z" };
vi.mock("@/src/entities/audit/api/get-audit-log-list", () => ({
  getAuditLogList: async (q: { entityId?: string }) => {
    if (q.entityId && !/^[0-9a-f-]{36}$/.test(q.entityId)) {
      throw Object.assign(new Error("입력값을 확인해 주세요"), { code: "VALIDATION_ERROR", status: 422 });
    }
    return { items: [row], total: 1, page: 1, limit: 10, totalPages: 1 };
  },
}));

import { AuditLogListPage } from "@/src/views/audit-logs";
afterEach(cleanup);

describe("P14-6 audit log filter error", () => {
  it("a failed filtered query clears rows (ok) but must not show a perpetual loading state", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter><AuditLogListPage /></MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText("김관리");
    fireEvent.change(screen.getByPlaceholderText("엔티티 ID (UUID)"), { target: { value: "1111-abc" } });
    fireEvent.click(screen.getByRole("button", { name: "조회" }));
    await new Promise((r) => setTimeout(r, 100));
    await waitFor(() => expect(screen.queryByText("김관리")).toBeNull(), { timeout: 500 });
    // 실패한 요청이 '불러오는 중...' 으로 영원히 남으면 안 된다 (오류 안내가 있어야 함)
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText("불러오는 중...")).toBeNull();
  });
});
