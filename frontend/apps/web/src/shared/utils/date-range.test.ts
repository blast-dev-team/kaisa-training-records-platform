import { describe, expect, it } from "vitest";

import { adjustDateRange } from "./date-range";

describe("adjustDateRange", () => {
  it("from이 to보다 작으면 그대로 둔다", () => {
    expect(adjustDateRange({ from: "2026-09-01", to: "2026-09-30" }, "from", "2026-08-15")).toEqual({
      from: "2026-08-15",
      to: "2026-09-30",
    });
  });

  it("from을 to보다 크게 입력하면 to가 따라 올라간다", () => {
    expect(adjustDateRange({ from: "2026-09-01", to: "2026-09-30" }, "from", "2026-10-05")).toEqual({
      from: "2026-10-05",
      to: "2026-10-05",
    });
  });

  it("to를 from보다 작게 입력하면 from이 따라 내려간다", () => {
    expect(adjustDateRange({ from: "2026-09-01", to: "2026-09-30" }, "to", "2026-08-20")).toEqual({
      from: "2026-08-20",
      to: "2026-08-20",
    });
  });

  it("to가 from보다 크면 그대로 둔다", () => {
    expect(adjustDateRange({ from: "2026-09-01", to: "2026-09-30" }, "to", "2026-12-01")).toEqual({
      from: "2026-09-01",
      to: "2026-12-01",
    });
  });

  it("반대쪽이 빈 값이면 보정하지 않는다", () => {
    expect(adjustDateRange({ from: "", to: "2026-09-30" }, "to", "2025-01-01")).toEqual({
      from: "",
      to: "2025-01-01",
    });
    expect(adjustDateRange({ from: "2026-09-01", to: "" }, "from", "2027-01-01")).toEqual({
      from: "2027-01-01",
      to: "",
    });
  });

  it("입력값을 비우면(해제) 보정 없이 빈 값이 된다", () => {
    expect(adjustDateRange({ from: "2026-09-01", to: "2026-09-30" }, "from", "")).toEqual({
      from: "",
      to: "2026-09-30",
    });
  });
});
