import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DocumentHoursNotice } from "./document-hours-notice";

describe("DocumentHoursNotice", () => {
  afterEach(cleanup);

  it("항상 기준 문구를 보여 준다", () => {
    render(<DocumentHoursNotice summary={{ total: 12, externalHours: 4, capped: false }} />);
    expect(screen.getByText(/외부교육 시간은 최대 16시간까지만 인정됩니다/)).toBeTruthy();
    expect(screen.queryByText(/만\s*인정돼/)).toBeNull();
  });

  it("고정되면 실제 시간을 강조한다", () => {
    render(<DocumentHoursNotice summary={{ total: 24, externalHours: 20, capped: true }} />);
    expect(screen.getByText(/외부교육 20시간 중 16시간만\s*인정돼 확인서 합계는 24시간으로 표기돼요/)).toBeTruthy();
  });
});
