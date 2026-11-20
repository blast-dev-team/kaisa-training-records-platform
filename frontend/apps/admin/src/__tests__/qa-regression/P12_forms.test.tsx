// P12-1: 감리원 정보 수정 창 — 등급 '미지정'(NULL) 감리원의 이름만 고쳐 저장해도 supervisor_grade:"감리원" 이 실려 등급이 바뀐다.
// P12-5: 회원등급 수정 창 — 설명을 지우고 저장하면 description 이 생략(undefined)돼 기존 설명이 지워지지 않는다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const patchTraineeSpy = vi.fn(async (_id: string, input: Record<string, unknown>) => input);
const patchGradeSpy = vi.fn(async (_id: string, input: Record<string, unknown>) => input);
vi.mock("@/src/entities/trainee/api/patch-trainee", () => ({
  patchTrainee: (id: string, input: Record<string, unknown>) => patchTraineeSpy(id, input),
}));
vi.mock("@/src/entities/trainee/api/patch-membership-grade", () => ({
  patchMembershipGrade: (id: string, input: Record<string, unknown>) => patchGradeSpy(id, input),
}));
vi.mock("@/src/entities/trainee/api/get-membership-grade-list", () => ({
  getMembershipGradeList: async () => [],
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TraineeFormDialog } from "@/src/views/trainees/ui/trainee-form-dialog";
import { GradeFormDialog } from "@/src/views/membership-grades/ui/grade-form-dialog";
import type { MembershipGrade, Trainee } from "@/src/entities/trainee";

const base: Trainee = {
  id: "t1", traineeNo: "TR-1", certNo: "제1361호", supervisorGrade: null, seniorCertNo: null,
  seniorCertIssuedDate: null, name: "홍길동", birthDate: "1980-01-01", phoneMasked: "010-****-1234",
  email: null, reviewStatus: "approved", membershipGradeId: null, gradeName: null, gradeExpiresAt: null,
  userId: null, memo: null, createdAt: "", updatedAt: "",
};
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
afterEach(() => { cleanup(); patchTraineeSpy.mockClear(); patchGradeSpy.mockClear(); });

const clickAndGet = async (label: string, spy: typeof patchTraineeSpy) => {
  const btn = await screen.findByRole("button", { name: label });
  await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(btn);
  await waitFor(() => expect(spy).toHaveBeenCalled());
  return spy.mock.calls[0]![1];
};

describe("P12 forms", () => {
  it("P12-1 editing only the name of a 미지정(null) trainee must not set supervisor_grade", async () => {
    render(<QueryClientProvider client={qc()}><TraineeFormDialog isOpen onClose={() => {}} trainee={base} /></QueryClientProvider>);
    // 등급 셀렉트 초기 표시도 저장값(미지정)과 일치해야 한다
    expect.soft((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("미지정");
    const payload = await clickAndGet("저장", patchTraineeSpy);
    expect(payload.supervisor_grade ?? null).toBe(null);
  });

  it("P12-5 clearing a grade description must send a clearing value (null/''), not omit it", async () => {
    const grade: MembershipGrade = { id: "g1", code: "general", name: "일반", description: "기존 설명",
      sortOrder: 1, priceKrw: 3000, isActive: true, createdAt: "" };
    render(<QueryClientProvider client={qc()}><GradeFormDialog isOpen onClose={() => {}} grade={grade} /></QueryClientProvider>);
    fireEvent.change(screen.getByPlaceholderText("선택"), { target: { value: "" } });
    const payload = await clickAndGet("수정", patchGradeSpy);
    expect("description" in payload && payload.description !== undefined).toBe(true);
  });
});
