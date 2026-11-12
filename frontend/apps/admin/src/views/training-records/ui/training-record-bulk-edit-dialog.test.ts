import { describe, expect, it } from "vitest";

import type { TrainingRecord } from "@/src/entities/training-record";
import { buildUpdates, rowsMissingCourse, toRow } from "./training-record-bulk-edit-dialog";

const record: TrainingRecord = {
  id: "r1",
  traineeId: "t1",
  traineeName: "박수정",
  traineeNo: null,
  traineeCertNo: null,
  traineeBirthDate: null,
  traineePhone: null,
  courseId: "course-old",
  sessionId: null,
  institutionId: "inst-old",
  institutionType: "internal",
  courseName: "감리 실무 기본",
  institutionName: "(사)정보시스템감리협회",
  supervisorGrade: null,
  supervisorCertNo: null,
  totalHours: 8,
  completedHours: 8,
  startedAt: "2026-10-01",
  endedAt: "2026-10-01",
  source: "internal",
  completionStatus: "completed",
  memo: null,
  createdAt: "",
  updatedAt: "",
};
const originals = new Map([[record.id, record]]);

describe("일괄 수정 — 기관·과정", () => {
  it("행은 이력의 기관·과정으로 시작한다", () => {
    const row = toRow(record);
    expect([row.institutionId, row.institutionName, row.courseId]).toEqual([
      "inst-old",
      "(사)정보시스템감리협회",
      "course-old",
    ]);
  });

  it("다른 기관의 과정을 고르면 과정만 보낸다 — 기관은 서버가 과정에서 맞춘다", () => {
    const row = { ...toRow(record), institutionId: "inst-new", courseId: "course-new" };
    expect(buildUpdates([row], originals)).toEqual([{ id: "r1", courseId: "course-new" }]);
  });

  it("기관만 바꾸고 과정을 안 고르면 저장을 막는다", () => {
    const row = { ...toRow(record), institutionId: "inst-new", courseId: null, courseName: "" };
    expect(rowsMissingCourse([row], originals)).toHaveLength(1);
  });

  it("기관을 바꾸고 과정까지 고르면 막지 않는다", () => {
    const row = { ...toRow(record), institutionId: "inst-new", courseId: "course-new" };
    expect(rowsMissingCourse([row], originals)).toHaveLength(0);
  });

  it("아무것도 안 바꾸면 보낼 게 없다", () => {
    expect(buildUpdates([toRow(record)], originals)).toEqual([]);
  });
});
