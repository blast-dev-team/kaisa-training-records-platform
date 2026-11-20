// P11-4: 엑셀 등록 확정 payload 가 프리뷰의 hours_recog(인정시간)를 버린다.
// BE import_confirm 은 hours_recog → hours_total 순으로 시수를 정하므로, 인정시간 4h·교육시간 8h 행이 8h 로 저장된다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const confirmSpy = vi.fn(async (..._a: unknown[]) => ({ created: 1, skipped: 0, failed: [] }));
vi.mock("@/src/entities/training-record/api/post-training-record-import-confirm", () => ({
  postTrainingRecordImportConfirm: (...a: unknown[]) => confirmSpy(...a),
}));
vi.mock("@/src/entities/training-record/api/post-training-record-import-preview", () => ({
  postTrainingRecordImportPreview: async () => ({
    total: 1,
    rows: [{
      row_number: 2, name: "홍길동", cert_no: "C-1", institution: "외부기관", subject: "보안교육",
      start_date: "2026-10-01", end_date: "2026-10-01", hours_total: "8", hours_recog: "4",
      trainee_id: "t1", trainee_name: "홍길동", trainee_grade_name: "평생", trainee_is_paid_member: true,
      institution_exists: true, course_exists: true, is_duplicate: false, errors: [],
    }],
  }),
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TrainingRecordImportDialog } from "@/src/views/training-records/ui/training-record-import-dialog";

afterEach(cleanup);

describe("P11-4 import confirm keeps 인정시간", () => {
  it("sends hours_recog from the preview row to import-confirm", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}><TrainingRecordImportDialog isOpen onClose={() => {}} /></QueryClientProvider>,
    );
    const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "a.xlsx")] } });
    fireEvent.click(await screen.findByRole("button", { name: /파일 읽기/ }));
    fireEvent.click(await screen.findByRole("button", { name: "1건 등록" }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    const items = confirmSpy.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(items[0]!.hours_recog).toBe("4");
  });
});
