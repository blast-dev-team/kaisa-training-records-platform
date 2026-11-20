// P14-1/2/3: 본인인증 심사 다이얼로그 — 승인 메모 유실, 승인 후 감리원 캐시 미갱신, 실패(이미 처리됨) 시 목록 미갱신
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const approveSpy = vi.fn(async (_id: string, _input: Record<string, unknown>) => ({}));
vi.mock("@/src/entities/identity-review/api/post-approve-identity-review", () => ({
  postApproveIdentityReview: (id: string, input: Record<string, unknown>) => approveSpy(id, input),
}));
vi.mock("@/src/entities/trainee/api/get-trainee-list", () => ({
  getTraineeList: async () => ({
    items: [{ id: "t1", name: "홍길동", traineeNo: "T1", certNo: "C1", seniorCertNo: null, phoneMasked: "010-****-1234" }],
    total: 1, page: 1, limit: 10, totalPages: 1,
  }),
}));
vi.mock("@/src/entities/trainee/api/get-membership-grade-list", () => ({
  getMembershipGradeList: async () => [{ id: "g1", name: "정회원" }],
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { ReviewDialog } from "@/src/views/identity-reviews/ui/review-dialog";
import type { IdentityReview } from "@/src/entities/identity-review";

const review: IdentityReview = {
  id: "rv1", identityVerificationId: "iv1", userId: "u1", userName: "홍길동", traineeId: null,
  verifiedName: "홍길동", verifiedPhoneMasked: "010-****-1234", status: "manual_review",
  matchedBy: null, determinedGradeId: null, reviewNote: null, reviewedAt: null, createdAt: "2026-11-01T00:00:00Z",
};

afterEach(() => { cleanup(); approveSpy.mockReset(); });

async function approveWithNote(qc: QueryClient) {
  render(<QueryClientProvider client={qc}><ReviewDialog review={review} onClose={() => {}} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  fireEvent.click(await screen.findByText("홍길동", { selector: "span.text-13" }));
  fireEvent.change(screen.getByPlaceholderText(/승인 시 참고 사항/), { target: { value: "전화 일치 확인함" } });
  const btn = screen.getByRole("button", { name: "승인" });
  await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(btn);
  await waitFor(() => expect(approveSpy).toHaveBeenCalled());
}

describe("P14 review dialog", () => {
  it("P14-1: approve sends the memo typed in '심사 메모' (UI offers it for approval)", async () => {
    approveSpy.mockResolvedValue({});
    await approveWithNote(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    expect(JSON.stringify(approveSpy.mock.calls[0]![1])).toContain("전화 일치 확인함");
  });

  it("P14-2: approve invalidates trainee caches (trainee.user_id / review_status changed)", async () => {
    approveSpy.mockResolvedValue({});
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const inv = vi.spyOn(qc, "invalidateQueries");
    await approveWithNote(qc);
    await waitFor(() => expect(inv).toHaveBeenCalled());
    const keys = inv.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys.some((k) => k?.startsWith('["trainees"'))).toBe(true);
  });

  it("P14-3: when approve fails because the review was already processed, the list is refreshed", async () => {
    approveSpy.mockRejectedValue(Object.assign(new Error("심사 대기 상태가 아니에요"), { code: "INVALID_STATUS_TRANSITION", status: 400 }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const inv = vi.spyOn(qc, "invalidateQueries");
    await approveWithNote(qc);
    await new Promise((r) => setTimeout(r, 50));
    const keys = inv.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys.some((k) => k?.startsWith('["identity-reviews"'))).toBe(true);
  });
});
