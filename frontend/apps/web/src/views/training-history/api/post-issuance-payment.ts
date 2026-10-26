/**
 * 확인서 발급 신청 + 포트원 결제 — 실제 백엔드 연동 (USE_MOCK 예외, 목록 API 참고).
 *
 * ① POST /certificate-requests/batch — 신청 생성. 게이트·가격 판정은 서버가 하고,
 *    유료면 주문번호(order_no)를 돌려준다. 0원(0원 등급)은 즉시 발급.
 *    같은 이력에 결제 대기 주문이 있으면 서버가 PortOne 에 먼저 확인한다 — 이미
 *    결제됐으면 그 주문으로 발급하고 409(PAYMENT_ALREADY_COMPLETED)를 준다(이중 결제 방지).
 * ② 포트원 브라우저 SDK(v2) 결제 — paymentId 는 서버 주문번호를 그대로 쓴다.
 *    모바일은 결제창이 페이지를 이동시키므로 redirectUrl(/payment/complete)로 돌아온다.
 * ③ POST /payments/{order_no}/confirm — 서버가 결제 상태·금액을 검증한 뒤 발급.
 *    결제는 됐는데 confirm 이 실패하면 "결제 확인 중" 상태로 넘겨 재결제 대신 재확인한다.
 */
import { isPaymentError, requestPayment } from "@portone/browser-sdk/v2";

export interface IssuanceRequestItem {
  /** 교육이력 ID */
  recordId: string;
}

export interface IssuancePaymentResult {
  /** 주문번호 — 0원 발급(0원 등급)은 결제 없이 즉시 발급이라 null */
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

/** 신청 단계 서버 오류 — code 로 화면 분기(예: PAYMENT_ALREADY_COMPLETED) */
export class IssuanceError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "IssuanceError";
    this.code = code;
  }
}

/**
 * 결제창은 끝났는데 서버 확정을 못 받은 상태 — 카드 결제는 됐을 수 있다.
 * 다시 결제하게 두면 이중 결제가 되므로 화면은 "다시 확인"만 제공한다.
 */
export class PaymentConfirmPendingError extends Error {
  readonly orderNo: string;

  constructor(orderNo: string, message?: string) {
    super(
      message ??
        "결제 확인이 늦어지고 있어요. 다시 결제하지 말고 '다시 확인'을 눌러 주세요",
    );
    this.name = "PaymentConfirmPendingError";
    this.orderNo = orderNo;
  }
}

/** 모바일 리디렉션 결제에서 돌아왔을 때 어떤 이력의 결제였는지 복원용 */
export interface PendingIssuance {
  orderNo: string;
  recordIds: string[];
}

const PENDING_ISSUANCE_KEY = "kaisa:pending-issuance";

function savePendingIssuance(pending: PendingIssuance): void {
  try {
    sessionStorage.setItem(PENDING_ISSUANCE_KEY, JSON.stringify(pending));
  } catch (error: unknown) {
    console.error("pending issuance save failed", error);
  }
}

export function readPendingIssuance(): PendingIssuance | null {
  try {
    const raw = sessionStorage.getItem(PENDING_ISSUANCE_KEY);
    return raw ? (JSON.parse(raw) as PendingIssuance) : null; // 이 모듈이 쓴 값만 읽는다
  } catch (error: unknown) {
    console.error("pending issuance read failed", error);
    return null;
  }
}

export function clearPendingIssuance(): void {
  try {
    sessionStorage.removeItem(PENDING_ISSUANCE_KEY);
  } catch (error: unknown) {
    console.error("pending issuance clear failed", error);
  }
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
        items: items.map((item) => ({ training_record_id: item.recordId })),
      }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new IssuanceError(
      body.message ?? "발급 신청에 실패했어요. 잠시 후 다시 시도해 주세요",
      body.code,
    );
  }
  return body;
}

/**
 * 결제 확정 — 서버가 PortOne 에 결제를 조회·검증하고 발급한다. 여러 번 불러도 한 번만 발급된다.
 * 실패하면 PaymentConfirmPendingError — 화면은 재결제 대신 재확인을 안내한다.
 */
export async function confirmIssuancePayment(orderNo: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE}/api/payments/${encodeURIComponent(orderNo)}/confirm`,
      { method: "POST", credentials: "include" },
    );
  } catch (error: unknown) {
    console.error("payment confirm request failed", error);
    throw new PaymentConfirmPendingError(orderNo);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new PaymentConfirmPendingError(
      orderNo,
      response.status === 401
        ? "본인인증 시간이 끝났어요. 결제된 건은 자동으로 발급되니, 다시 본인인증한 뒤 발급·결제 내역에서 확인해 주세요"
        : body.code === "PAYMENT_NOT_PAID"
          ? "아직 결제가 확인되지 않았어요. 결제를 마쳤다면 잠시 후 다시 확인해 주세요"
          : undefined,
    );
  }
  clearPendingIssuance();
}

export async function postIssuancePayment(params: {
  items: IssuanceRequestItem[];
}): Promise<IssuancePaymentResult> {
  if (!STORE_ID || !CHANNEL_KEY) {
    throw new Error("결제 설정이 없어요. 관리자에게 문의해 주세요");
  }

  const requests = await createRequests(params.items);

  // 유료 주문이 없으면 서버가 이미 발급까지 완료했다 (0원 등급)
  const orderNo =
    requests.find((request) => request.order_no !== null)?.order_no ?? null;
  if (orderNo === null) {
    return { orderId: null };
  }

  // 서버 주문 금액 = 유료 건 최고 단가 1회 (단 건·일괄 건 동일 요금 정책)
  const amount = Math.max(...requests.map((request) => request.amount_krw));

  savePendingIssuance({
    orderNo,
    recordIds: params.items.map((item) => item.recordId),
  });

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
      // 모바일은 결제창이 페이지를 이동시킨다 — 끝나면 이 주소로 돌아와 confirm 한다
      redirectUrl: `${window.location.origin}/payment/complete`,
    });

    // 응답이 없으면 결제 여부를 알 수 없다 — 실패로 보고 다시 결제하게 하면 이중 결제가
    // 될 수 있으므로 서버에 확인하는 쪽으로 보낸다
    if (!response) {
      throw new PaymentConfirmPendingError(orderNo);
    }
    if (response.code) {
      clearPendingIssuance();
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
      clearPendingIssuance();
      // 결제창을 직접 닫은 케이스 — 코드 리터럴이 SDK 타입에 없어 문자열로 판별
      if (String(error.code).includes("WINDOW_CLOSED")) {
        throw new Error("결제가 취소되었어요. 다시 시도해 주세요");
      }
      throw new Error("결제에 실패했어요. 잠시 후 다시 시도해 주세요");
    }
    throw error;
  }

  await confirmIssuancePayment(orderNo);
  return { orderId: orderNo };
}
