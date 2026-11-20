import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";

import { BareLayout } from "@/src/app/layouts/bare-layout";
import { IssuanceCompletePage } from "@/src/views/issuance-complete";
import { useAuthStore } from "@/src/shared/store/auth-store";

describe("P16-5 /training-history/:id/complete auth guard", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("unauthenticated visitor is redirected to intro like MainLayout routes", async () => {
    useAuthStore.getState().signOut();
    vi.spyOn(window, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ code: "UNAUTHORIZED", message: "로그인이 필요해요" }), { status: 401 }));
    const router = createMemoryRouter([
      { path: "/", element: <p>INTRO</p> },
      { path: "/training-history/:id", element: <BareLayout />,
        children: [{ path: "complete", element: <IssuanceCompletePage /> }] },
    ], { initialEntries: ["/training-history/abc/complete"] });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} /></QueryClientProvider>);
    await new Promise((r) => setTimeout(r, 50));
    expect(router.state.location.pathname).toBe("/");
  });
});
