/**
 * P15 list/detail mapper contract checks.
 * P15-2: issuableCount 는 현재 페이지 기준 — 요약 줄의 '총 N건'·'총 이수시간'(전체 필터) 과 집합이 다르다.
 * P15-5: 상세 매퍼는 certificate_status 누락 시 issuable(fail-open), 목록은 unavailable.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { getTrainingHistoryList } from "@/src/views/training-history/api/get-training-history-list";
import { getTrainingHistoryDetail } from "@/src/views/training-history/api/get-training-history-detail";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

const rec = (i: number) => ({
  id: `r${i}`, started_at: "2026-03-01", ended_at: "2026-03-01", course_name: `c${i}`,
  institution_name: "X", total_hours: "1", certificate_status: "issuable",
  institution_type: "internal", completion_status: "completed",
});

afterEach(() => vi.unstubAllGlobals());

describe("P15 mappers", () => {
  it("P15-2 issuableCount 는 전체 필터 기준이어야 한다 (총 25건 전부 발급 가능)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      json({ items: Array.from({ length: 10 }, (_, i) => rec(i)), total: 25, page: 1, limit: 10, total_pages: 3, total_hours_sum: 25,
        // 수정 후 계약: 서버가 전체 필터 기준 발급 가능 건수를 내려준다
        issuable_count: 25 })));
    const result = await getTrainingHistoryList({ page: 1, limit: 10, period: "all", search: "" });
    expect(result.total).toBe(25);
    expect(result.totalHoursSum).toBe(25);
    expect(result.issuableCount).toBe(25);
  });

  it("P15-5 상세 certificate_status 누락 시 목록과 같이 unavailable 이어야 한다", async () => {
    const { certificate_status: _omit, ...noStatus } = rec(1);
    vi.stubGlobal("fetch", vi.fn(async () => json(noStatus)));
    const detail = await getTrainingHistoryDetail("r1");
    vi.stubGlobal("fetch", vi.fn(async () =>
      json({ items: [noStatus], total: 1, page: 1, limit: 10, total_pages: 1, total_hours_sum: 1 })));
    const list = await getTrainingHistoryList({ page: 1, limit: 10, period: "all", search: "" });
    expect(list.items[0]!.certificateStatus).toBe("unavailable");
    expect(detail.certificateStatus).toBe(list.items[0]!.certificateStatus);
  });
});
