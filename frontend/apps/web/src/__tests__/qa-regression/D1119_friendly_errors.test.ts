// 2026-11-19 — BE·네트워크 오류를 사용자가 이해할 수 있는 문구로만 보여 준다
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  NETWORK_ERROR_MESSAGE,
  toUserMessage,
} from "@/src/shared/lib/friendly-error";

const realFetch = vi.fn<typeof fetch>();

beforeAll(async () => {
  window.fetch = realFetch as unknown as typeof fetch;
  const { installSessionEndInterceptor } = await import("@/src/shared/lib/session-end-interceptor");
  installSessionEndInterceptor();
});
afterEach(() => realFetch.mockReset());

describe("fetch 인터셉터", () => {
  it("한국어 서버 문구는 그대로 둔다", async () => {
    realFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "EXTERNAL_HOURS_EXCEEDED", message: "외부교육은 최근 3년 동안 최대 16시간까지 등록할 수 있어요" }), {
        status: 422, headers: { "content-type": "application/json" },
      }),
    );
    const res = await window.fetch("/api/me/x");
    expect((await res.json()).message).toBe("외부교육은 최근 3년 동안 최대 16시간까지 등록할 수 있어요");
  });

  it("영문 원문(게이트웨이 기본 응답)은 상태별 한국어 안내로 바꾼다", async () => {
    realFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Internal server error" }), {
        status: 502, headers: { "content-type": "application/json" },
      }),
    );
    const res = await window.fetch("/api/certificate-price");
    expect(res.status).toBe(502);
    expect((await res.json()).message).toContain("서버가 잠시 응답하지 않아요");
  });

  it("HTML 오류 페이지도 JSON {message} 로 바꿔 'Unexpected token <' 노출을 막는다", async () => {
    realFetch.mockResolvedValueOnce(
      new Response("<html>Bad Gateway</html>", { status: 503, headers: { "content-type": "text/html" } }),
    );
    const res = await window.fetch("/api/inquiries");
    const body = await res.json();
    expect(body.message).toContain("서비스 점검 중");
  });

  it("네트워크 끊김의 'Failed to fetch' 대신 한국어 안내", async () => {
    realFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(window.fetch("/api/me/training-records")).rejects.toThrow(NETWORK_ERROR_MESSAGE);
  });

  it("사용자가 취소한 요청(AbortError)은 그대로 던진다", async () => {
    realFetch.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    await expect(window.fetch("/api/me/x")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("성공 응답은 건드리지 않는다", async () => {
    realFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const res = await window.fetch("/api/me/x");
    expect(await res.json()).toEqual({ ok: 1 });
  });
});

describe("toUserMessage", () => {
  it("영문 JS 예외는 화면 문구로 바꾼다", () => {
    expect(toUserMessage(new SyntaxError("Unexpected token < in JSON"), "조회하지 못했어요")).toBe("조회하지 못했어요");
    expect(toUserMessage(new Error("문의를 찾을 수 없어요"), "x")).toBe("문의를 찾을 수 없어요");
  });
});
