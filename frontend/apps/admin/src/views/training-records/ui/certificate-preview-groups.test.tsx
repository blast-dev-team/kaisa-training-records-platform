import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { TrainingRecord } from "@/src/entities/training-record";
import { buildDownloadGroups } from "./certificate-preview-modal";
import { DocumentHoursNotice } from "./document-hours-notice";

const record = (
  id: string,
  traineeId: string,
  totalHours: number,
  institutionType: TrainingRecord["institutionType"],
): TrainingRecord => ({
  id,
  traineeId,
  traineeName: traineeId === "t1" ? "김외부" : "이사내",
  traineeNo: null,
  traineeCertNo: null,
  traineeBirthDate: null,
  traineePhone: null,
  courseId: null,
  sessionId: null,
  institutionId: null,
  institutionType,
  courseName: `과정${id}`,
  institutionName: "기관",
  supervisorGrade: null,
  supervisorCertNo: null,
  totalHours,
  completedHours: totalHours,
  startedAt: "2026-01-01",
  endedAt: "2026-01-02",
  source: "external",
  completionStatus: "completed",
  memo: null,
  createdAt: "",
  updatedAt: "",
});

describe("buildDownloadGroups — 합계 고정", () => {
  it("외부 20시간 + 사내 8시간 → 합계 24, 행은 원래 시간", () => {
    const groups = buildDownloadGroups([
      record("a", "t1", 8, "internal"),
      record("b", "t1", 10, "external"),
      record("c", "t1", 10, null),
    ]);
    expect(groups[0]?.totalHours).toBe(24);
    expect(groups[0]?.externalCapped).toBe(true);
    expect(groups[0]?.externalHours).toBe(20);
    expect(groups[0]?.rows.map((row) => row.hours)).toEqual([8, 10, 10]);
  });

  it("감리원별로 따로 판정한다", () => {
    const groups = buildDownloadGroups([
      record("a", "t1", 20, "external"),
      record("b", "t2", 20, "internal"),
    ]);
    expect(groups.map((group) => [group.totalHours, group.externalCapped])).toEqual([
      [16, true],
      [20, false],
    ]);
  });
});

describe("DocumentHoursNotice", () => {
  afterEach(cleanup);

  it("항상 기준 문구를 보여 준다", () => {
    render(<DocumentHoursNotice groups={[{ key: "t2", traineeName: "이사내", totalHours: 20, externalHours: 0, externalCapped: false }]} />);
    expect(screen.getByText(/외부교육 시간은 최대 16시간까지만 인정됩니다/)).toBeTruthy();
    expect(screen.queryByText(/만 인정돼 합계가/)).toBeNull();
  });

  it("고정되는 문서가 있으면 실제 시간을 강조한다", () => {
    render(<DocumentHoursNotice groups={[{ key: "t1", traineeName: "김외부", totalHours: 24, externalHours: 20, externalCapped: true }]} />);
    expect(screen.getByText(/외부교육 20시간 중 16시간만 인정돼 합계가 24시간으로 표기돼요/)).toBeTruthy();
  });
});
