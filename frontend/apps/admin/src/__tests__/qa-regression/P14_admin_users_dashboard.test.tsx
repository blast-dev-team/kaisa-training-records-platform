// P14-4: 관리자 계정 — 내 계정 행에도 '차단' 버튼 노출(BE 400). P14-5: 대시보드 KPI 링크가 집계 필터를 안 실음
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

vi.mock("@/src/entities/auth/api/get-me", () => ({
  getMe: async () => ({ accountType: "admin", id: "a1", email: "me@k.kr", name: "나", role: "super" }),
}));
vi.mock("@/src/entities/admin-user/api/get-admin-user-list", () => ({
  getAdminUserList: async () => [
    { id: "a1", email: "me@k.kr", name: "나", role: "super", status: "active", lastLoginAt: null, createdAt: "2026-01-01T00:00:00Z" },
    { id: "a2", email: "other@k.kr", name: "남", role: "staff", status: "active", lastLoginAt: null, createdAt: "2026-01-01T00:00:00Z" },
  ],
}));
const page = { items: [], total: 3, page: 1, limit: 20, totalPages: 1 };
vi.mock("@/src/entities/trainee/api/get-trainee-list", () => ({ getTraineeList: async () => page }));
vi.mock("@/src/entities/identity-review/api/get-identity-review-list", () => ({ getIdentityReviewList: async () => page }));
vi.mock("@/src/entities/certificate/api/get-certificate-list", () => ({ getCertificateList: async () => page }));
vi.mock("@/src/entities/payment/api/get-payment-order-list", () => ({ getPaymentOrderList: async () => page }));
vi.mock("@/src/entities/course-session/api/get-course-session-list", () => ({ getCourseSessionList: async () => page }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { AdminUserListPage } from "@/src/views/admin-users";
import { DashboardPage } from "@/src/views/dashboard";

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
afterEach(cleanup);

describe("P14 admin users / dashboard", () => {
  it("P14-4: own row must not offer '차단' (BE: 자신의 계정은 비활성화할 수 없어요)", async () => {
    wrap(<AdminUserListPage />);
    const myRow = (await screen.findByText("me@k.kr")).closest("tr")!;
    expect(within(myRow).queryByRole("button", { name: "차단" })).toBeNull();
  });

  it("P14-5: KPI '심사 대기' (manual_review count) links to a list filtered the same way", async () => {
    wrap(<DashboardPage />);
    const link = (await screen.findByText("심사 대기")).closest("a")!;
    expect(link.getAttribute("href")).toContain("status=manual_review");
  });
});
