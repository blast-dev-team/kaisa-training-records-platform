// P11-5: 선택(Map)에 행 스냅샷을 담아 두고 갱신하지 않는다.
//  (a) 선택한 행을 행 '삭제'로 지워도 선택에 남아 일괄 삭제 요청에 삭제된 id 가 들어간다(BE get_record 404 → 전체 실패).
//  (b) 선택 후 목록이 갱신(다른 곳에서 수정)돼도 확인서 미리보기에 옛 시수가 넘어간다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { TrainingRecord } from "@/src/entities/training-record";

const mk = (id: string, name: string, hours: number): TrainingRecord => ({
  id, traineeId: "t1", traineeName: "홍길동", traineeNo: "T1", traineeCertNo: "C1", traineeBirthDate: null,
  traineePhone: null, courseId: "c1", sessionId: null, institutionId: "i1", institutionType: "internal",
  courseName: name, institutionName: "기관A", supervisorGrade: null, supervisorCertNo: null,
  totalHours: hours, completedHours: hours, startedAt: "2026-10-01", endedAt: "2026-10-02",
  source: "internal", completionStatus: "completed", memo: null, createdAt: "2026-10-03T00:00:00", updatedAt: "",
});
let rows: TrainingRecord[] = [];
vi.mock("@/src/entities/training-record/api/get-training-record-list", () => ({
  getTrainingRecordList: async () => ({ items: rows.map((r) => ({ ...r })), total: rows.length, page: 1, limit: 10, totalPages: 1, totalHoursSum: 0 }),
}));
vi.mock("@/src/entities/training-record/api/delete-training-record", () => ({
  deleteTrainingRecord: async (id: string) => { rows = rows.filter((r) => r.id !== id); },
}));
const bulkDel = vi.fn(async (ids: string[]) => ids.length);
vi.mock("@/src/entities/training-record/api/delete-training-record-bulk", () => ({ deleteTrainingRecordBulk: (ids: string[]) => bulkDel(ids) }));
let previewRecords: TrainingRecord[] = [];
vi.mock("@/src/views/training-records/ui/certificate-preview-modal", () => ({
  CertificatePreviewModal: (p: { records: TrainingRecord[] }) => { previewRecords = p.records; return null; },
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TrainingRecordListPage } from "@/src/views/training-records/ui/training-record-list-page";

afterEach(() => { cleanup(); bulkDel.mockClear(); });
const setup = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter><TrainingRecordListPage /></MemoryRouter></QueryClientProvider>);
  return qc;
};
const rowOf = async (name: string) => (await screen.findByText(name)).closest("tr") as HTMLElement;

describe("P11-5 selection snapshot", () => {
  it("(a) single-deleted row must not stay in bulk-delete selection", async () => {
    rows = [mk("A", "과정A", 8), mk("B", "과정B", 8)];
    setup();
    fireEvent.click(within(await rowOf("과정A")).getByRole("checkbox"));
    fireEvent.click(within(await rowOf("과정B")).getByRole("checkbox"));
    fireEvent.click(within(await rowOf("과정A")).getByRole("button", { name: "삭제" }));
    await screen.findByText(/내역을 삭제할까요/);
    const dels = screen.getAllByRole("button", { name: "삭제" });
    fireEvent.click(dels[dels.length - 1]!); // 확인 다이얼로그(포털, 마지막)
    await waitFor(() => expect(screen.queryByText("과정A")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /일괄 삭제/ }));
    fireEvent.click(await screen.findByRole("button", { name: /건 삭제$/ }));
    await waitFor(() => expect(bulkDel).toHaveBeenCalled());
    expect(bulkDel.mock.calls[0]![0]).toEqual(["B"]);
  });

  it("(b) certificate preview must use refreshed row data, not the click-time snapshot", async () => {
    rows = [mk("A", "과정A", 8)];
    const qc = setup();
    fireEvent.click(within(await rowOf("과정A")).getByRole("checkbox"));
    rows = [mk("A", "과정A", 4)]; // 다른 화면/수정 모달에서 시수 수정 후 목록 갱신
    await qc.invalidateQueries({ queryKey: ["training-records"] });
    await waitFor(() => expect(within(screen.getByText("과정A").closest("tr")!).getByText("4")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /확인서 미리보기/ }));
    await waitFor(() => expect(previewRecords.length).toBe(1));
    expect(previewRecords[0]!.totalHours).toBe(4);
  });
});
