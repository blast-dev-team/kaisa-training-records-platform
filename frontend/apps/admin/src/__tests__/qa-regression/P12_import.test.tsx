// P12-3: 엑셀 등록 프리뷰 — 오류 행(감리원명 누락 등)을 프리뷰에서 고쳐도 errors 가 남아 '등록' 이 막힌다.
// P12-4: 여러 파일/같은 파일 안 같은 감리원증번호 행을 둘 다 '신규'로 포함해 confirm 에 그대로 보낸다
//        (+ 파일 간 row_number 충돌을 그대로 보내 실패 결과를 구분할 수 없다).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TraineeImportRow } from "@/src/entities/trainee";

const r = (p: Partial<TraineeImportRow>): TraineeImportRow => ({
  row_number: 2, name: "홍길동", phone: null, birth_date: "1980-01-01", cert_no: "제1호",
  supervisor_grade: "감리원", cert_issued_date: null, is_duplicate: false, is_promotion: false,
  duplicate_of_name: null, errors: [], ...p,
});
let previewRows: TraineeImportRow[] = [];
const confirmSpy = vi.fn(async (_items: Record<string, unknown>[]) => ({ created: 0, promoted: 0, skipped: 0, failed: [] }));
vi.mock("@/src/entities/trainee/api/post-trainee-import-preview", () => ({
  postTraineeImportPreview: async () => ({ rows: previewRows, total: previewRows.length }),
}));
vi.mock("@/src/entities/trainee/api/post-trainee-import-confirm", () => ({
  postTraineeImportConfirm: (items: Record<string, unknown>[]) => confirmSpy(items),
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TraineeImportDialog } from "@/src/views/trainees/ui/trainee-import-dialog";

afterEach(() => { cleanup(); confirmSpy.mockClear(); });
const mount = () => render(
  <QueryClientProvider client={new QueryClient()}><TraineeImportDialog isOpen onClose={() => {}} /></QueryClientProvider>,
);
const pick = (files: File[]) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
};
const xlsx = (n: string) => new File(["x"], n);

describe("P12 import preview", () => {
  it("P12-3 fixing a '감리원명 누락' row in preview must make it registrable", async () => {
    previewRows = [r({ name: null, errors: ["감리원명이 비어 있어요"] })];
    mount();
    pick([xlsx("a.xlsx")]);
    fireEvent.click(screen.getByRole("button", { name: /파일 읽기/ }));
    const cb = (await screen.findAllByRole("checkbox"))[1]!; // [0] = 전체 포함
    fireEvent.click(cb); // 포함
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0]!, { target: { value: "홍길동" } }); // 감리원명 입력
    expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toBe("홍길동"); // 편집 반영됨
    // 수정 후: 고친 행의 옛 오류는 지워진다
    expect(screen.queryByText(/감리원명이 비어 있어요/)).toBeNull();
    const btn = screen.getByRole("button", { name: "1명 등록" });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("P12-4 same cert_no from two files must not both be sent as new registrations", async () => {
    previewRows = [r({ row_number: 2, cert_no: "제1호" })];
    mount();
    pick([xlsx("a.xlsx"), xlsx("b.xlsx")]);
    fireEvent.click(screen.getByRole("button", { name: /2개 파일 읽기/ }));
    const btn = await screen.findByRole("button", { name: /명 등록/ });
    // 수정 후: 두 번째 파일의 같은 증번호 행은 미리보기에서 '중복'으로 빠져 1명만 등록 대상
    await waitFor(() => expect(btn.textContent).toBe("1명 등록"));
    fireEvent.click(btn);
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    const items = confirmSpy.mock.calls[0]![0];
    const rowNos = items.map((i) => i.row_number);
    expect.soft(new Set(rowNos).size).toBe(rowNos.length); // row_number 충돌
    expect(items.filter((i) => i.cert_no === "제1호").length).toBe(1);
  });
});
