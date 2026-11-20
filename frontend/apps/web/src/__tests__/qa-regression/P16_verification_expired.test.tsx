import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getVerificationResult } from "@/src/shared/api/get-verification-result";
import { VerificationFailModal } from "@/src/widget/verification-modal";

describe("P16-3 expired certificate verification", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("expired result (BE message null) must not be shown as 'no matching certificate'", async () => {
    // BE _verify_certificate: result=expired, message omitted (null), doc fields present
    vi.spyOn(window, "fetch").mockResolvedValue(new Response(JSON.stringify({
      result: "expired", kind: "certificate", certificate_no: "CERT-20260101-1",
      issued_name_masked: "홍○동", course_name: "c", total_hours: "8.00",
      training_ended_at: "2026-01-01", issued_at: "2026-01-02", expires_at: "2026-04-02",
      records: [], message: null }), { status: 200 }));
    const r = await getVerificationResult({ verificationId: "CERT-20260101-1", applicantName: "홍길동", docType: "certificate" });
    render(<VerificationFailModal message={r.message} successorNo={r.successorNo} onRetry={() => {}} />);
    expect(screen.queryByText(/일치하는 확인서가 없습니다/)).toBeNull();
  });
});
