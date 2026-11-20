// P13-6: 선택한 일정을 행의 '삭제'로 지운 뒤에도 selectedIds 에 남아, 일괄 삭제가 지워진 id 를 보내
// BE 404("존재하지 않는 일정이 포함됐어요")로 전체 실패한다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

const mk = (id: string, name: string) => ({
  id, courseId: "c", courseName: name, institutionId: "i", institutionName: "기관", institutionType: "internal",
  source: "internal", scheduleNo: null, startedAt: "2026-10-01", endedAt: "2026-10-02", totalHours: 8,
  recognizedHours: 8, isActive: true, memo: null, enrolledCount: 0, createdAt: "2026-10-01", updatedAt: "",
});
let rows = [mk("A", "과정A"), mk("B", "과정B")];
const bulkSpy = vi.fn(async (ids: string[]) => ids.length);
vi.mock("@/src/entities/course-session/api/get-course-session-list", () => ({
  getCourseSessionList: async () => ({ items: rows, total: rows.length, page: 1, limit: 10, totalPages: 1 }),
}));
vi.mock("@/src/entities/course-session/api/delete-course-session", () => ({
  deleteCourseSession: async (id: string) => { rows = rows.filter((r) => r.id !== id); },
}));
vi.mock("@/src/entities/course-session/api/delete-course-session-bulk", () => ({
  deleteCourseSessionBulk: (ids: string[]) => bulkSpy(ids),
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { CourseSessionListPage } from "@/src/views/course-sessions/ui/course-session-list-page";

afterEach(() => cleanup());

describe("P13 list selection", () => {
  it("P13-6 bulk delete after single-row delete must not send the already-deleted id", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><CourseSessionListPage /></MemoryRouter>
    </QueryClientProvider>);
    const cbA = await screen.findByLabelText("과정A 선택");
    fireEvent.click(cbA);
    fireEvent.click(screen.getByLabelText("과정B 선택"));
    fireEvent.click(within(screen.getByLabelText("과정A 선택").closest("tr")!).getByRole("button", { name: "삭제" }));
    const dlg = await screen.findByText(/'과정A' 일정을 삭제할까요/);
    fireEvent.click(within(dlg.closest("[role=dialog]") ?? document.body).getAllByRole("button", { name: "삭제" }).at(-1)!);
    await waitFor(() => expect(screen.queryByLabelText("과정A 선택")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /일괄 삭제/ }));
    fireEvent.click(await screen.findByRole("button", { name: /개 삭제$/ }));
    await waitFor(() => expect(bulkSpy).toHaveBeenCalled());
    expect(bulkSpy.mock.calls[0]![0]).toEqual(["B"]);
  });
});
