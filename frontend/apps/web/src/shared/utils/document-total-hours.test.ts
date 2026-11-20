import { describe, expect, it } from "vitest";

import { documentHoursSummary, isExternalInstitutionType } from "./document-total-hours";

// BE(test_document_total_hours.py)·ADMIN 과 같은 표 — 세 곳이 같은 결과를 내야 한다
const CASES: [Array<[number, boolean]>, number][] = [
  [[], 0],
  [[[8, false]], 8],
  [[[10, true]], 10],
  [[[16, true]], 16],
  [[[20, true]], 16],
  [[[10, true], [10, true]], 16],
  [[[8, false], [10, true], [10, true]], 24],
  [[[8, false], [12, false], [4, true]], 24],
  [[[16.5, true], [2.5, false]], 18.5],
  [[[15.5, true], [0.5, true]], 16],
  [[[40, false], [30, true]], 56],
];

describe("documentHoursSummary", () => {
  it.each(CASES)("%j → %d", (rows, expected) => {
    expect(documentHoursSummary(rows.map(([hours, isExternal]) => ({ hours, isExternal }))).total).toBe(
      expected,
    );
  });

  it("외부 합계가 16을 넘을 때만 capped", () => {
    expect(documentHoursSummary([{ hours: 16, isExternal: true }]).capped).toBe(false);
    expect(documentHoursSummary([{ hours: 16.5, isExternal: true }]).capped).toBe(true);
  });

  it("외부 합계는 상한 적용 전 값", () => {
    expect(documentHoursSummary([{ hours: 12, isExternal: true }, { hours: 9, isExternal: true }]).externalHours).toBe(21);
  });

  it("소수 합산 꼬리를 정리한다", () => {
    expect(documentHoursSummary([{ hours: 0.1, isExternal: false }, { hours: 0.2, isExternal: false }]).total).toBe(0.3);
  });
});

describe("isExternalInstitutionType", () => {
  it("사내만 외부가 아니다 — 미선택·미연결은 외부", () => {
    expect(isExternalInstitutionType("internal")).toBe(false);
    expect(isExternalInstitutionType("external")).toBe(true);
    expect(isExternalInstitutionType(null)).toBe(true);
    expect(isExternalInstitutionType(undefined)).toBe(true);
  });
});
