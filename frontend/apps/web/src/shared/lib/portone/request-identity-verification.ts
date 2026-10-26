/**
 * PASS 본인인증 — 포트원 브라우저 SDK(v2).
 *
 * 최종 검증은 서버가 한다 — 호출부가 postPassComplete(state) 로 서버에 넘기면
 * 서버가 포트원 본인인증 조회 API 로 결과를 직접 확인한다.
 *
 * 모바일은 인증창이 페이지를 이동시켜 Promise 가 끝나지 않는다. 그래서 서버가 준
 * state 를 sessionStorage 에 두고 redirectUrl(/auth/pass/complete)에서 이어서 완료한다.
 */
import { requestIdentityVerification } from "@portone/browser-sdk/v2";

export interface IdentityVerificationParams {
  /** 본인인증 건 ID — 서버(postPassStart)가 등록·서명한 값 */
  identityVerificationId: string;
  /** 인증 대상자 성명 — PG 본인인증창에 미리 채워짐 */
  fullName: string;
  /** 생년월일 8자리 (YYYYMMDD) */
  birth: string;
  /** 휴대전화 번호 — 하이픈 없는 숫자 */
  phoneNumber: string;
  /** 서버(postPassStart)가 준 서명된 state — 모바일 복귀 화면이 complete 에 쓴다 */
  state: string;
}

const PASS_STATE_KEY = "kaisa:pass-state";

export function readPendingPassState(): string | null {
  try {
    return sessionStorage.getItem(PASS_STATE_KEY);
  } catch (error: unknown) {
    console.error("pass state read failed", error);
    return null;
  }
}

export function clearPendingPassState(): void {
  try {
    sessionStorage.removeItem(PASS_STATE_KEY);
  } catch (error: unknown) {
    console.error("pass state clear failed", error);
  }
}

const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID ?? "";
const CHANNEL_KEY = import.meta.env.VITE_PORTONE_IDENTITY_CHANNEL_KEY ?? "";

/** 인증창 결과 — completed 면 호출부가 서버 complete 를 부른다. cancelled 는 사용자가 창을 닫음 */
export type PassVerificationOutcome = "completed" | "cancelled";

export async function requestPassIdentityVerification(
  params: IdentityVerificationParams,
): Promise<PassVerificationOutcome> {
  if (!STORE_ID || !CHANNEL_KEY) {
    throw new Error("본인인증 설정이 없어요. 관리자에게 문의해 주세요");
  }

  try {
    sessionStorage.setItem(PASS_STATE_KEY, params.state);
  } catch (error: unknown) {
    console.error("pass state save failed", error);
  }

  const response = await requestIdentityVerification({
    storeId: STORE_ID,
    channelKey: CHANNEL_KEY,
    identityVerificationId: params.identityVerificationId,
    customer: {
      fullName: params.fullName,
      birthYear: params.birth.slice(0, 4),
      birthMonth: params.birth.slice(4, 6),
      birthDay: params.birth.slice(6, 8),
      phoneNumber: params.phoneNumber,
    },
    redirectUrl: `${window.location.origin}/auth/pass/complete`,
  });

  // 본인인증창을 직접 닫은 케이스(응답 없음·WINDOW_CLOSED) — 취소라 에러가 아니다.
  // 예전엔 여기서 그냥 return 해 호출부가 complete 를 불렀고 "로그인 실패"가 떴다
  if (!response || String(response.code).includes("WINDOW_CLOSED")) {
    clearPendingPassState();
    return "cancelled";
  }

  if (response.code) {
    console.error("[portone] 본인인증 실패", {
      code: response.code,
      message: response.message,
      pgCode: response.pgCode,
      pgMessage: response.pgMessage,
    });
    clearPendingPassState();
    throw new Error("본인인증에 실패했어요. 입력값을 확인하고 다시 시도해 주세요");
  }
  return "completed";
}
