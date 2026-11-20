// P09 — ADMIN entities FE↔BE contract repros. Fixtures are shaped from BE Pydantic schemas.
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/react";
vi.mock("@sentry/react", () => ({ addBreadcrumb: vi.fn(), setUser: vi.fn() }));
import { mapCertificate } from "@/src/entities/certificate/api/map-certificate";
import { apiClient, ApiError } from "@/src/shared/api/instance";
import { patchMyPassword } from "@/src/entities/auth/api/patch-my-password";
import { formatActionLabel } from "@/src/entities/audit/model/audit-labels";

afterEach(() => vi.restoreAllMocks());

// BE CertificateResponse (backend/api/app/domain/certificate/schema/certificate.py:22-81)
const beCertificate = {
  id: "c1", certificate_no: "K-1", bundle_no: "K-1", doc_no: "D-1", certificate_request_id: "r1",
  trainee_id: "t1", training_record_id: "tr1", payment_order_id: null, issued_name: "홍길동",
  course_name: "과정A", institution_name: "기관A", total_hours: "8.00", completed_hours: "8.00",
  training_started_at: "2026-10-01", training_ended_at: "2026-10-01", issued_at: "2026-11-01T00:00:00Z",
  expires_at: null, status: "issued", issue_source: "admin", revoked_at: null, revoked_reason: null,
  downloaded_at: null, download_count: 0, record_count: 3,
};

describe("P09-1 certificate list bundle count", () => {
  it("maps BE record_count (bundle of 3) to memberCount", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = mapCertificate(beCertificate as any);
    expect(c.memberCount).toBe(3);
  });
});

describe("P09-2 self password change body", () => {
  it("sends snake_case keys that BE PasswordChangeRequest requires", async () => {
    const spy = vi.spyOn(apiClient, "patch").mockResolvedValue({ data: { ok: true } });
    await patchMyPassword({ currentPassword: "old-passw0rd", newPassword: "new-passw0rd" });
    expect(spy.mock.calls[0]![1]).toEqual({ current_password: "old-passw0rd", new_password: "new-passw0rd" });
  });
});

describe("P09-3 wrong current password (BE 401 INVALID_CREDENTIALS)", () => {
  it("surfaces the BE error and does not force-redirect to /login", async () => {
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, pathname: "/training-records", replace });
    const body = { code: "INVALID_CREDENTIALS", message: "현재 비밀번호가 일치하지 않아요" };
    const err = await apiClient
      .patch("/auth/password", {}, {
        adapter: async (config) => {
          const e = Object.assign(new Error("401"), {
            isAxiosError: true, config, response: { status: 401, data: body, headers: {}, config },
          });
          throw e;
        },
      })
      .catch((e: unknown) => e as ApiError);
    vi.unstubAllGlobals();
    expect((err as ApiError).code).toBe("INVALID_CREDENTIALS");
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("P09-4 audit action labels cover BE actions", () => {
  it.each(["allowed_email.invite_reissued", "trainee.grade_import"])("%s has a Korean label", (a) => {
    expect(formatActionLabel(a)).not.toBe(a);
  });
});

describe("P09-5 failed login breadcrumb must not carry the plaintext password", () => {
  it("scrubs password from the Sentry breadcrumb request_body", async () => {
    vi.mocked(Sentry.addBreadcrumb).mockClear();
    const body = { code: "INVALID_CREDENTIALS", message: "이메일 또는 비밀번호가 일치하지 않아요" };
    await apiClient
      .post("/auth/login", { email: "a@example.com", password: "S3cret-typed-pw" }, {
        adapter: async (config) => {
          throw Object.assign(new Error("401"), {
            isAxiosError: true, config, response: { status: 401, data: body, headers: {}, config },
          });
        },
      })
      .catch(() => undefined);
    const crumb = vi.mocked(Sentry.addBreadcrumb).mock.calls[0]![0];
    expect(String(crumb.data?.request_body)).not.toContain("S3cret-typed-pw");
  });
});
