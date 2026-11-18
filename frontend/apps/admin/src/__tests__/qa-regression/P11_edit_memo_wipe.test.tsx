// P11-1: 교육내역 수정 모달이 기존 메모를 폼에 채우지 않아, 메모를 건드리지 않고 저장해도 memo:null 이 PATCH 된다.
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

const record = (over: Partial<TrainingRecord> = {}): TrainingRecord => ({
  id: "r1", traineeId: "t1", traineeName: "홍길동", traineeNo: "T1", traineeCertNo: "C1",
  traineeBirthDate: null, traineePhone: null, courseId: "c1", sessionId: null, institutionId: "i1",
  institutionType: "internal", courseName: "과정A", institutionName: "기관A", supervisorGrade: null,
  supervisorCertNo: null, totalHours: 8, completedHours: 8, startedAt: "2026-10-01", endedAt: "2026-10-02",
  source: "internal", completionStatus: "completed", memo: "중요 메모 — 증빙 원본 보관", createdAt: "", updatedAt: "",
  ...over,
});

afterEach(() => { cleanup(); patchSpy.mockClear(); });

const renderDialog = (r: TrainingRecord | null) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TrainingRecordFormDialog isOpen onClose={() => {}} record={r} />
    </QueryClientProvider>,
  );
};

describe("P11-1 edit form memo", () => {
  it("shows the existing memo and keeps it on save when untouched", async () => {
    renderDialog(record());
    const memo = screen.getByPlaceholderText("참고 사항") as HTMLTextAreaElement;
    expect(memo.value).toBe("중요 메모 — 증빙 원본 보관");
  });

  it("PATCH payload preserves the memo when the admin edits only hours", async () => {
    renderDialog(record());
    fireEvent.change(screen.getByPlaceholderText("예: 8"), { target: { value: "6" } });
    const btn = await screen.findByRole("button", { name: "수정" });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    await waitFor(() => expect(patchSpy).toHaveBeenCalled());
    expect(patchSpy.mock.calls[0]![1].memo).toBe("중요 메모 — 증빙 원본 보관");
  });
});
