// P10-7: list query failure (5xx) renders an endless "불러오는 중..." instead of an error
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { AxiosError } from "axios";

vi.mock("@sentry/react", () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));
import { apiClient } from "@/src/shared/api/instance";
import { AuditLogListPage } from "@/src/views/audit-logs";

afterEach(cleanup);

describe("P10-7 list error state", () => {
  it("a 500 on the list query is surfaced (not an infinite loading row)", async () => {
    const calls = vi.fn();
    apiClient.defaults.adapter = async (config) => {
      calls();
      const response = { data: "<html>502 Bad Gateway</html>", status: 502, statusText: "", headers: {}, config, request: {} };
      throw new AxiosError("bad", "ERR_BAD_RESPONSE", config, {}, response as never);
    };
    // same defaults as app/providers.tsx
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
    render(
      <QueryClientProvider client={qc}><MemoryRouter><AuditLogListPage /></MemoryRouter></QueryClientProvider>,
    );
    await waitFor(() => expect(calls).toHaveBeenCalled());
    await waitFor(() => expect(qc.getQueryCache().getAll()[0]?.state.status).toBe("error"));
    expect(screen.queryByText("불러오는 중...")).toBeNull();
  });
});
