// P11-2: 신규 등록 창에서 쓴 메모가 닫은 뒤 다른 이력 '수정' 창에 그대로 남아 그 이력에 저장된다.
// P11-3: 수정 창이 총 시수 빈칸/음수를 막지 않아 total_hours:null(→BE 500, P04-2) / 음수(P04-4)를 그대로 보낸다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const patchSpy = vi.fn(async (_id: string, input: Record<string, unknown>) => ({ id: "r1", ...input }));
vi.mock("@/src/entities/training-record/api/patch-training-record", () => ({
  patchTrainingRecord: (id: string, input: Record<string, unknown>) => patchSpy(id, input),
}));
vi.mock("@/src/entities/training-record/api/get-external-hours", () => ({
  getExternalHours: async () => ({ windowStart: "2023-11-18", externalHours: 0, maxHours: 16, remainingHours: 16 }),
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TrainingRecordFormDialog } from "@/src/views/training-records/ui/training-record-form-dialog";
import type { TrainingRecord } from "@/src/entities/training-record";

const rec: TrainingRecord = {
  id: "r1", traineeId: "t1", traineeName: "홍길동", traineeNo: "T1", traineeCertNo: "C1",
  traineeBirthDate: null, traineePhone: null, courseId: "c1", sessionId: null, institutionId: "i1",
  institutionType: "internal", courseName: "과정A", institutionName: "기관A", supervisorGrade: null,
  supervisorCertNo: null, totalHours: 8, completedHours: 8, startedAt: "2026-10-01", endedAt: "2026-10-02",
  source: "internal", completionStatus: "completed", memo: null, createdAt: "", updatedAt: "",
};

afterEach(() => { cleanup(); patchSpy.mockClear(); });
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const ui = (client: QueryClient, isOpen: boolean, record: TrainingRecord | null) => (
  <QueryClientProvider client={client}>
    <TrainingRecordFormDialog isOpen={isOpen} onClose={() => {}} record={record} />
  </QueryClientProvider>
);
const submit = async () => {
  const btn = await screen.findByRole("button", { name: "수정" });
  await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(btn);
  await waitFor(() => expect(patchSpy).toHaveBeenCalled());
  return patchSpy.mock.calls[0]![1];
};

describe("P11 form payload", () => {
  it("P11-2 memo typed in a cancelled create dialog must not leak into another record's edit", async () => {
    const client = qc();
    const { rerender } = render(ui(client, true, null));
    fireEvent.change(screen.getByPlaceholderText("참고 사항"), { target: { value: "다른 사람 메모" } });
    rerender(ui(client, false, null)); // 취소로 닫기
    rerender(ui(client, true, rec)); // 다른 이력 '수정'
    expect((await submit()).memo).toBe(null);
  });

  it("P11-3a edit must not submit blank hours as total_hours:null", async () => {
    render(ui(qc(), true, rec));
    fireEvent.change(screen.getByPlaceholderText("예: 8"), { target: { value: "" } });
    const btn = await screen.findByRole("button", { name: "수정" });
    await new Promise((r) => setTimeout(r, 50));
    if (!(btn as HTMLButtonElement).disabled) {
      fireEvent.click(btn);
      await waitFor(() => expect(patchSpy).toHaveBeenCalled());
    }
    expect(patchSpy.mock.calls[0]?.[1].total_hours).not.toBe(null);
  });

  it("P11-3b edit must not submit negative hours", async () => {
    render(ui(qc(), true, rec));
    fireEvent.change(screen.getByPlaceholderText("예: 8"), { target: { value: "-5" } });
    const btn = await screen.findByRole("button", { name: "수정" });
    await new Promise((r) => setTimeout(r, 50));
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});
