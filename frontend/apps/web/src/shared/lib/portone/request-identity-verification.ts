/**
 * PASS 본인인증 — 포트원 브라우저 SDK(v2).
 *
 * 인증 결과 검증은 프론트 응답만으로 판단한다(백엔드 미연동). 백엔드 연동 시
 * identityVerificationId를 서버로 전달해 포트원 본인인증 조회 API로 최종 검증한다.
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
}

const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID ?? "";
const CHANNEL_KEY = import.meta.env.VITE_PORTONE_IDENTITY_CHANNEL_KEY ?? "";

export async function requestPassIdentityVerification(
  params: IdentityVerificationParams,
): Promise<void> {
  if (!STORE_ID || !CHANNEL_KEY) {
    throw new Error("본인인증 설정이 없어요. 관리자에게 문의해 주세요");
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
  });

  // 본인인증창을 직접 닫은 케이스(응답 없음·WINDOW_CLOSED) — 취소이므로 에러로 취급하지 않는다
  if (!response || String(response.code).includes("WINDOW_CLOSED")) return;

  if (response.code) {
    console.error("[portone] 본인인증 실패", {
      code: response.code,
      message: response.message,
      pgCode: response.pgCode,
      pgMessage: response.pgMessage,
    });
    throw new Error("본인인증에 실패했어요. 입력값을 확인하고 다시 시도해 주세요");
  }
}
