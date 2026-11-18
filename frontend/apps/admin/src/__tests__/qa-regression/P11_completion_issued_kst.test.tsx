// P11-7: 수료증 발급일 표기가 BE 의 UTC 문자열('...Z') 앞 10자를 잘라 쓴다 — KST 00:00~08:59 발급분은 하루 전 날짜가 찍힌다.
// BE 는 timestamptz 를 UTC('2026-11-18T04:17:23Z')로 직렬화함을 P11 probe 로 확인(P11__bulk_clear_hours.log 참조).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CompletionCertificateSheet } from "@/src/views/training-records/ui/completion-certificate-sheet";

afterEach(cleanup);

describe("P11-7 completion certificate issued date is KST", () => {
  it("issued at 2026-11-19 01:30 KST (= 2026-11-18T16:30Z) prints 2026년 11월 19일", () => {
    render(
      <CompletionCertificateSheet
        certificate={{
          id: "c", certificateNo: "No.1", trainingRecordId: "r", traineeId: "t", traineeName: "홍길동",
          traineeBirthDate: "1980-01-01", courseName: "과정", sessionName: null, institutionName: "협회",
          completedHours: 8, startedAt: "2026-11-01", endedAt: "2026-11-02",
          issuedAt: "2026-11-18T16:30:00Z", status: "issued",
        }}
      />,
    );
    expect(screen.queryByText(/2026년 11월 19일/)).not.toBeNull();
  });
});
