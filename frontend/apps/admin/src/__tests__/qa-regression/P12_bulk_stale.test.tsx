// P12-2: 목록 선택은 Trainee 객체 스냅샷을 들고 있어, 선택 후 개별 '수정'으로 바꾼 값을
// 일괄 '정보 수정' 저장이 옛 스냅샷 값으로 되돌린다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { Trainee } from "@/src/entities/trainee";

const state = { name: "홍길동" };
const row = (): Trainee => ({
  id: "t1", traineeNo: "TR-1", certNo: "제1호", supervisorGrade: "감리원", seniorCertNo: null,
  seniorCertIssuedDate: null, name: state.name, birthDate: "1980-01-01", phoneMasked: "010-****-1234",
  email: null, reviewStatus: "approved", membershipGradeId: null, gradeName: null, gradeExpiresAt: null,
  userId: null, memo: null, createdAt: "", updatedAt: "", internalHours: 0, externalHours: 0,
});
const bulkSpy = vi.fn(async (_input: { items: Record<string, unknown>[] }) => ({ updated: 1, skipped: 0 }));
vi.mock("@/src/entities/trainee/api/get-trainee-list", () => ({
  getTraineeList: async () => ({ items: [row()], total: 1, page: 1, limit: 10, totalPages: 1 }),
}));
vi.mock("@/src/entities/trainee/api/patch-trainee", () => ({
  patchTrainee: async (_id: string, input: { name?: string }) => { state.name = input.name ?? state.name; return row(); },
}));
vi.mock("@/src/entities/trainee/api/post-trainee-bulk-update", () => ({
  postTraineeBulkUpdate: (input: { items: Record<string, unknown>[] }) => bulkSpy(input),
}));
vi.mock("@/src/entities/trainee/api/get-membership-grade-list", () => ({ getMembershipGradeList: async () => [] }));
vi.mock("@/src/entities/trainee/api/get-trainee-duplicates", () => ({ getTraineeDuplicates: async () => [] }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TraineeListPage } from "@/src/views/trainees/ui/trainee-list-page";

afterEach(() => cleanup());

describe("P12-2 bulk edit stale selection", () => {
  it("bulk save after an individual edit must not revert the edited name", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><TraineeListPage /></MemoryRouter></QueryClientProvider>);
    fireEvent.click(await screen.findByText("홍길동")); // 행 클릭 = 선택
    await screen.findByText("선택 1명");
    fireEvent.click(screen.getAllByRole("button", { name: "수정" })[0]!); // 개별 수정
    const nameInput = await screen.findByDisplayValue("홍길동");
    fireEvent.change(nameInput, { target: { value: "홍길동(개명)" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("홍길동(개명)"); // 목록 재조회 반영
    fireEvent.click(screen.getByRole("button", { name: "정보 수정" }));
    fireEvent.click(await screen.findByRole("button", { name: "1명 저장" }));
    // 수정 후: 바뀐 칸만 보낸다 — 아무것도 고치지 않았으면 요청 자체가 없고("변경된 내용이 없어요"),
    // 보낸다면 이름은 최신값이어야 한다(옛 이름으로 되돌리면 안 된다)
    await new Promise((r) => setTimeout(r, 50));
    for (const call of bulkSpy.mock.calls) {
      for (const item of call[0].items) {
        expect(item.name === undefined || item.name === "홍길동(개명)").toBe(true);
      }
    }
    void within;
  });
});
