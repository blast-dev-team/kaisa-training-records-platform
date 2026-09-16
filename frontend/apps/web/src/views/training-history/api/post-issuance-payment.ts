/**
 * 확인서 발급 신청 + 포트원 결제 — 실제 백엔드 연동 (USE_MOCK 예외, 목록 API 참고).
 *
 * ① POST /certificate-requests/batch — 신청 생성. 게이트·가격 판정은 서버가 하고,
 *    유료면 주문번호(order_no)를 돌려준다. 0원(무료 재발급 등)은 즉시 발급.
 * ② 포트원 브라우저 SDK(v2) 결제 — paymentId 는 서버 주문번호를 그대로 쓴다.
 *    (FE가 임의 paymentId 를 만들면 서버가 포트원 단일조회를 할 수 없다)
 * ③ POST /payments/{order_no}/confirm — 서버가 결제 상태·금액을 검증한 뒤 발급.
 */
import { isPaymentError, requestPayment } from "@portone/browser-sdk/v2";

export type IssueType = "original" | "reissue";

export interface IssuanceRequestItem {
  /** 교육이력 ID */
  recordId: string;
  issueType: IssueType;
}

export interface IssuancePaymentResult {
  /** 주문번호 — 0원 발급(무료 재발급)은 결제 없이 즉시 발급이라 null */
  orderId: string | null;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID ?? "";
const CHANNEL_KEY = import.meta.env.VITE_PORTONE_CHANNEL_KEY ?? "";

/** 백엔드 CertificateRequestResponse — snake_case 그대로 */
interface CertificateRequestDto {
  training_record_id: string;
  amount_krw: number;
  status: string;
  order_no: string | null;
}

async function createRequests(
  items: IssuanceRequestItem[],
): Promise<CertificateRequestDto[]> {
  const response = await fetch(
    `${API_BASE}/api/certificate-requests/batch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        items: items.map((item) => ({
          training_record_id: item.recordId,
          issue_type: item.issueType,
        })),
      }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      body.message ?? "발급 신청에 실패했어요. 잠시 후 다시 시도해 주세요",
    );
  }
  return body;
}

async function confirmPayment(orderNo: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/payments/${encodeURIComponent(orderNo)}/confirm`,
    { method: "POST", credentials: "include" },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // 결제 자체는 성공했을 수 있다 — 서버 confirm(또는 웹훅)이 발급을 완료한다
    throw new Error(
      body.message ??
        "결제 확인이 늦어지고 있어요. 잠시 후 발급 내역에서 확인해 주세요",
    );
  }
}

export async function postIssuancePayment(params: {
  items: IssuanceRequestItem[];
}): Promise<IssuancePaymentResult> {
  if (!STORE_ID || !CHANNEL_KEY) {
    throw new Error("결제 설정이 없어요. 관리자에게 문의해 주세요");
  }

  const requests = await createRequests(params.items);

  // 유료 주문이 없으면 서버가 이미 발급까지 완료했다 (0원 — 무료 재발급 등)
  const orderNo =
    requests.find((request) => request.order_no !== null)?.order_no ?? null;
  if (orderNo === null) {
    return { orderId: null };
  }

  // 서버 주문 금액 = 유료 건 최고 단가 1회 (단 건·일괄 건 동일 요금 정책)
  const amount = Math.max(...requests.map((request) => request.amount_krw));

  try {
    const response = await requestPayment({
      storeId: STORE_ID,
      channelKey: CHANNEL_KEY,
      paymentId: orderNo,
      orderName:
        params.items.length > 1
          ? `교육이수 확인서 발급 수수료 (${params.items.length}건)`
          : "교육이수 확인서 발급 수수료",
      totalAmount: amount,
      currency: "CURRENCY_KRW",
      payMethod: "CARD",
    });

    // 리디렉션 결제창 등 응답이 없거나 실패 코드가 내려온 경우
    if (!response || response.code) {
      throw new Error("결제에 실패했어요. 잠시 후 다시 시도해 주세요");
    }
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

  await confirmPayment(orderNo);
  return { orderId: orderNo };
}
