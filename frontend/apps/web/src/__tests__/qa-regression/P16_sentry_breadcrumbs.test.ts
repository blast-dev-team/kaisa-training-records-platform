import { afterEach, describe, expect, it, vi } from "vitest";

const initMock = vi.fn();
const addBreadcrumbMock = vi.fn();
vi.mock("@sentry/react", () => ({
  init: (opts: unknown) => initMock(opts),
  addBreadcrumb: (b: unknown) => addBreadcrumbMock(b),
  setUser: vi.fn(),
}));

async function boot() {
  vi.stubEnv("VITE_SENTRY_DSN", "https://***@example.invalid/1");
  window.fetch = vi.fn(async () => new Response("{}", { status: 201 })) as typeof fetch;
  const { initSentry } = await import("@/src/shared/lib/sentry");
  initSentry();
  return initMock.mock.calls[0]![0] as { beforeBreadcrumb: (b: unknown) => unknown };
}

describe("P16 sentry fetch wrapper", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); initMock.mockReset(); addBreadcrumbMock.mockReset(); });

  it("P16-1: guest inquiry password must not be recorded in breadcrumb request_body", async () => {
    await boot();
    await window.fetch("/api/public/inquiries", {
      method: "POST",
      body: JSON.stringify({ name: "홍길동", phone: "01000000000", password: "123456" }),
    });
    const body = String(addBreadcrumbMock.mock.calls[0]?.[0]?.data?.request_body ?? "");
    expect(body).not.toContain("123456");
  });

  it("P16-2: wrapper breadcrumb for a failed GET (response_body only) must survive beforeBreadcrumb", async () => {
    const opts = await boot();
    const crumb = { category: "fetch", type: "http", level: "error",
      data: { url: "/api/me/payment-history", method: "GET", status_code: 401,
        request_body: undefined, response_body: '{"code":"SESSION_EXPIRED"}' } };
    expect(opts.beforeBreadcrumb(crumb)).not.toBeNull();
  });
});
