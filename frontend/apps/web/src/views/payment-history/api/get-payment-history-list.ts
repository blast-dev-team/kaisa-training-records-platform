/**
 * 발급·결제 내역 조회 API — 실제 백엔드 연동 (USE_MOCK 예외, 교육이력 목록 API 참고).
 * GET /api/me/payment-history — 결제완료·환불 주문만 주문 단위로 반환한다.
 * (다건 발급 주문은 대표 확인서 1건 + certificate_count 로 표기)
 */

/** 결제 상태 */
export type PaymentStatus = "paid" | "refunded";

/** 상태 필터 — 전체(all)는 기본값이라 URL 키를 생략한다 */
export type PaymentStatusFilter = "all" | PaymentStatus;

export interface PaymentHistoryItem {
  id: string;
  /** 결제일시 (KST — 'YYYY-MM-DDTHH:mm') */
  paidAt: string;
  /** 확인서 번호 (예: CERT-20260916-1) */
  certificateNumber: string;
  /** 교육명 — 다건 발급이면 '교육명 외 N건' */
  courseName: string;
  /** 결제수단 표기 (예: 카드 · 간편결제 · 계좌이체) */
  method: string;
  /** 영수증(카드전표) URL — 결제수단 클릭 시 새 탭에서 연다 */
  receiptUrl?: string;
  /** 금액 (원) */
  amount: number;
  status: PaymentStatus;
  /** 거래 명세서 PDF URL — 없으면 FE 임시 명세서로 대체 */
  statementUrl?: string;
}

export interface PaymentHistoryListParams {
  page: number;
  limit: number;
  /** 조회 기간 시작 (YYYY-MM-DD) — 비면 전체 */
  from?: string;
  /** 조회 기간 끝 (YYYY-MM-DD) — 비면 전체 */
  to?: string;
  status: PaymentStatusFilter;
}

export interface PaymentHistoryListResult {
  items: PaymentHistoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** 백엔드 MyPaymentHistoryItem — snake_case 그대로 */
interface PaymentHistoryDto {
  id: string;
  order_no: string;
  paid_at: string | null;
  certificate_no: string | null;
  certificate_count: number;
  course_name: string | null;
  method: string | null;
  receipt_url: string | null;
  amount_krw: number;
  status: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

/** 서버 timestamptz(UTC) → 로컬(KST) 'YYYY-MM-DDTHH:mm' — slice 금지(하루 어긋남) */
function formatPaidAt(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toItem(dto: PaymentHistoryDto): PaymentHistoryItem {
  const courseName =
    dto.certificate_count > 1 && dto.course_name
      ? `${dto.course_name} 외 ${dto.certificate_count - 1}건`
      : (dto.course_name ?? "");
  return {
    id: dto.id,
    paidAt: dto.paid_at ? formatPaidAt(dto.paid_at) : "",
    // 확인서 미발급 주문(운영 이슈 등)은 주문번호로 식별
    certificateNumber: dto.certificate_no ?? dto.order_no,
    courseName,
    method: dto.method ?? "",
    receiptUrl: dto.receipt_url ?? undefined,
    amount: dto.amount_krw,
    status: dto.status === "refunded" ? "refunded" : "paid",
  };
}

export async function getPaymentHistoryList(
  params: PaymentHistoryListParams,
): Promise<PaymentHistoryListResult> {
  const search = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.status !== "all") search.set("status", params.status);

  const response = await fetch(
    `${API_BASE}/api/me/payment-history?${search.toString()}`,
    { credentials: "include" },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.message ?? "문제가 생겼어요. 잠시 후 다시 시도해 주세요",
    );
  }

  const data = await response.json();
  const items: PaymentHistoryItem[] = (data.items ?? []).map(toItem);
  return {
    items,
    total: data.total ?? items.length,
    page: data.page ?? params.page,
    limit: data.limit ?? params.limit,
    totalPages:
      data.total_pages ?? Math.max(1, Math.ceil((data.total ?? 0) / params.limit)),
  };
}
