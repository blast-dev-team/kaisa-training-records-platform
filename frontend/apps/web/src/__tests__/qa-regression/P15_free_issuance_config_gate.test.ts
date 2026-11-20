/**
 * P15-4: 0원 등급 발급(결제창 없음)도 PortOne STORE_ID/CHANNEL_KEY 가 없으면
 * 서버 신청 전에 "결제 설정이 없어요" 로 막힌다. 서버는 0원이면 즉시 발급한다
 * (request_service.create_requests_batch total_krw == 0 분기).
 * 테스트 환경엔 VITE_PORTONE_* 가 없다 = 설정 누락 상태.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { postIssuancePayment } from "@/src/views/training-history/api/post-issuance-payment";

afterEach(() => vi.unstubAllGlobals());

describe("P15-4 free issuance blocked by PortOne config check", () => {
  it("0원 신청은 PortOne 설정 없이도 발급돼야 한다", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([
        { training_record_id: "r1", amount_krw: 0, status: "paid", order_no: null },
      ]), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await postIssuancePayment({ items: [{ recordId: "r1" }] }).then(
      (r) => ({ ok: true as const, r }),
      (e: Error) => ({ ok: false as const, message: e.message }),
    );
    expect(outcome).toEqual({ ok: true, r: { orderId: null } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
