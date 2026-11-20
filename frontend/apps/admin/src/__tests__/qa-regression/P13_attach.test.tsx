// P13-8: '외부 교육으로 저장' 표시가 session.source(낡은 값)를 따라 같은 창의 외부 한도 배너·실제 저장값과 어긋난다.
// P13-9: 이미 연결된 감리원 판정이 불러온 첫 페이지(10명)만 보므로 11번째 이후 연결자가 엑셀 대조에서 다시 선택된다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/src/entities/institution/api/get-course-detail", () => ({
  getCourseDetail: async () => ({ id: "c1", institutionId: "i1", institutionName: "기관A", institutionType: "external", name: "과정A" }),
}));
vi.mock("@/src/entities/trainee/api/get-trainee-list", () => ({
  getTraineeList: async () => ({ items: [], total: 0, page: 1, limit: 30, totalPages: 1 }),
}));
const rec = (n: number) => ({ id: `r${n}`, traineeId: `t${n}`, traineeName: `감리원${n}`, traineeCertNo: null, completedHours: 8, startedAt: "2026-10-01" });
vi.mock("@/src/entities/training-record/api/get-training-record-list", () => ({
  getTrainingRecordList: async ({ page }: { page: number }) =>
    page === 1
      ? { items: Array.from({ length: 10 }, (_, i) => rec(i + 1)), total: 11, page: 1, limit: 10, totalPages: 2 }
      : { items: [rec(11)], total: 11, page: 2, limit: 10, totalPages: 2 },
}));
vi.mock("@/src/entities/training-record/api/post-training-record-match-preview", () => ({
  postTrainingRecordMatchPreview: async () => ({ total_rows: 1, matched: [{ trainee_id: "t11", name: "감리원11", cert_no: null, matched_by: "name", row_number: 2 }], unmatched: [] }),
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { AttachTraineesDialog } from "@/src/views/course-sessions/ui/attach-trainees-dialog";
import type { CourseSession } from "@/src/entities/course-session";

// 기관 구분이 사내→외부로 바뀐 뒤의 일정 — P06: session.source 는 갱신되지 않는다
const sess: CourseSession = {
  id: "s1", courseId: "c1", courseName: "과정A", institutionId: "i1", institutionName: "기관A",
  institutionType: "external", source: "internal", scheduleNo: null, startedAt: "2026-10-01",
  endedAt: "2026-10-01", totalHours: 8, recognizedHours: 8, isActive: true, memo: null,
  enrolledCount: 11, createdAt: "", updatedAt: "",
};
afterEach(() => cleanup());
const wrap = () =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AttachTraineesDialog isOpen onClose={() => {}} session={sess} />
  </QueryClientProvider>);

describe("P13 attach dialog", () => {
  it("P13-8 '외부 교육으로 저장' must agree with the external-institution banner", async () => {
    wrap();
    await screen.findByText(/이 일정은 외부 기관 교육이에요/);
    const cb = screen.getByLabelText(/외부 교육으로 저장/) as HTMLInputElement;
    expect(cb.checked).toBe(true);
  });

  it("P13-9 Excel match must not re-select a trainee already connected (beyond first page)", async () => {
    const { container } = wrap();
    await screen.findByText("11명");
    const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "a.xlsx")] } });
    await screen.findByText(/매칭된 감리원 1명/);
    await waitFor(() => expect(screen.getByRole("button", { name: /명 연결$/ })).toBeTruthy());
    expect(screen.getByRole("button", { name: /명 연결$/ }).textContent).toBe("0명 연결");
  });
});
