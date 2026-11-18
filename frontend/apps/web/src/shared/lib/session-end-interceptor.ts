import {
  NETWORK_ERROR_MESSAGE,
  friendlyServerMessage,
  hasHangul,
  statusMessage,
} from "@/src/shared/lib/friendly-error";
import { handleSessionEndResponse } from "@/src/shared/store/auth-store";

/** 회원 세션이 필요한 API — 이 경로의 401 은 '세션이 끝났다'는 뜻이다.
 *  결제 확인(/api/payments)은 제외 — 결제 모달이 401 을 직접 안내하고 재확인 경로를 유지한다 */
const MEMBER_API = /\/api\/(me|certificate-requests|completion-certificates)(\/|\?|$)/;

/** 우리 BE API 요청 — 오류 문구 정리 대상 */
const API_PATH = /\/api(\/|\?|$)/;

let installed = false;

/**
 * 실패 응답의 message 가 사용자용 한국어가 아니면(게이트웨이 기본 응답 등) 상태별 안내로 바꾼
 * 새 Response 를 돌려준다. 호출부는 지금처럼 body.message 를 그대로 보여 주면 된다.
 */
export async function withFriendlyMessage(response: Response): Promise<Response> {
  const type = response.headers.get("content-type") ?? "";
  let body: unknown = null;
  if (type.includes("application/json")) {
    try {
      body = await response.clone().json();
    } catch {
      body = null;
    }
  }
  if (body === null) {
    // 게이트웨이 HTML 오류 페이지 등 — 호출부가 JSON 을 기대하므로 같은 형태로 바꿔 준다
    // (그대로 두면 JSON 파싱 예외 원문 "Unexpected token <" 이 화면에 뜰 수 있다)
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json");
    return new Response(
      JSON.stringify({ code: "HTTP_ERROR", message: statusMessage(response.status) }),
      { status: response.status, statusText: response.statusText, headers },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;
  const record = body as Record<string, unknown>;
  if (hasHangul(record.message)) return response;
  const patched = { ...record, message: friendlyServerMessage(record.message, response.status) };
  return new Response(JSON.stringify(patched), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * fetch 래퍼 — 회원 API 가 401 을 돌려주면 인증 상태를 내리고 만료 안내를 띄운다.
 *
 * 예전에는 FE 10분 타이머만 믿어서, 다른 탭에서 인증을 해제했거나 서버가 세션을 먼저
 * 끝낸 경우 타이머가 끝날 때까지 인증된 화면이 남고 화면마다 오류 문구만 보였다.
 */
export function installSessionEndInterceptor(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const isApi = API_PATH.test(url);
    let response: Response;
    try {
      response = await original(input, init);
    } catch (e) {
      // 네트워크 끊김의 브라우저 원문("Failed to fetch")을 화면에 노출하지 않는다.
      // 사용자가 취소한 요청(AbortError)은 호출부가 구분하므로 그대로 던진다
      if (isApi && !(e instanceof DOMException && e.name === "AbortError")) {
        throw new Error(NETWORK_ERROR_MESSAGE);
      }
      throw e;
    }
    if (isApi && !response.ok) {
      response = await withFriendlyMessage(response);
    }
    if (response.status === 401) {
      if (MEMBER_API.test(url)) {
        let code: unknown;
        try {
          code = ((await response.clone().json()) as { code?: unknown })?.code;
        } catch {
          code = undefined;
        }
        handleSessionEndResponse(response.status, code);
      }
    }
    return response;
  };
}
