/**
 * 확인서 발급 결제 — 포트원 브라우저 SDK(v2) 테스트 결제.
 *
 * 백엔드가 아직 없어 결제 검증(금액·상태 확인)은 프론트 응답만으로 판단한다.
 * SDK 응답의 paymentId를 주문번호(orderId)로 그대로 반환하며, 백엔드 연동 시
 * 이 값을 서버로 전달해 결제 조회 API로 최종 검증하도록 한다.
 */
import { isPaymentError, requestPayment } from "@portone/browser-sdk/v2";

export interface IssuancePaymentParams {
  /** 교육이력 ID */
  recordId: string;
  /** 발급 용도 — 미선택 시 빈 문자열 */
  purpose: string;
  /** 발급·환불 규정 동의 여부 — 서버 최종 검증 대상 */
  agreed: boolean;
  /** 결제 금액(원) — 페이지의 발급 수수료 */
  amount: number;
}

export interface IssuancePaymentResult {
  /** 주문번호 — 포트원 paymentId. 발급 완료 조회·결제 내역 연결 키 */
  orderId: string;
}

const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID ?? "";
const CHANNEL_KEY = import.meta.env.VITE_PORTONE_CHANNEL_KEY ?? "";

export async function postIssuancePayment(
  params: IssuancePaymentParams,
): Promise<IssuancePaymentResult> {
  if (!STORE_ID || !CHANNEL_KEY) {
    throw new Error("결제 설정이 없어요. 관리자에게 문의해 주세요");
  }

  // 포트원 주문번호 — 건별 고유. KCP V2 채널은 40자 제한이 있어 UUID 대신 짧은 고유값
  const paymentId = `iss-${params.recordId.slice(0, 20)}-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  try {
    const response = await requestPayment({
      storeId: STORE_ID,
      channelKey: CHANNEL_KEY,
      paymentId,
      orderName: "교육이수 확인서 발급 수수료",
      totalAmount: params.amount,
      currency: "CURRENCY_KRW",
      payMethod: "CARD",
    });

    // 리디렉션 결제창 등 응답이 없거나 실패 코드가 내려온 경우
    if (!response || response.code) {
      throw new Error("결제에 실패했어요. 잠시 후 다시 시도해 주세요");
    }
    return { orderId: response.paymentId };
  } catch (error) {
    if (isPaymentError(error)) {
      // 사용자에게는 한국어 안내만 — 상세 사유는 콘솔에서 확인
      console.error("[portone] 결제 실패", {
        code: error.code,
        message: error.message,
        pgCode: error.pgCode,
        pgMessage: error.pgMessage,
      });
      // 결제창을 직접 닫은 케이스 — 코드 리터럴이 SDK 타입에 없어 문자열로 판별
      if (String(error.code).includes("WINDOW_CLOSED")) {
        throw new Error("결제가 취소되었어요. 다시 시도해 주세요");
      }
      throw new Error("결제에 실패했어요. 잠시 후 다시 시도해 주세요");
    }
    throw error;
  }
}
