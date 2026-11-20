import { describe, expect, it } from "vitest";

import { useAuthStore } from "@/src/shared/store/auth-store";

describe("P16-4 auth store after signOut", () => {
  it("signOut clears previous user's name so a nameless next sign-in does not show it", () => {
    const s = useAuthStore.getState();
    s.signIn("이전사람", Date.now() + 60_000, true, false);
    useAuthStore.getState().signOut();
    // pass-complete-page: signIn(user.name ?? undefined, ...) when PASS result has no name
    useAuthStore.getState().signIn(undefined, Date.now() + 60_000);
    expect(useAuthStore.getState().userName).not.toBe("이전사람");
    useAuthStore.getState().signOut();
  });
});
