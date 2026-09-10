/**
 * 발급·결제 내역 조회 API.
 *
 * 백엔드가 아직 없어 VITE_API_URL 미설정 시 Figma 노드(19:25200)의 목업 데이터를
 * 반환한다. 백엔드 스펙 확정 후 경로·응답 매핑을 조정한다.
 */

/** 결제 상태 */
export type PaymentStatus = "paid" | "refunded";

/** 상태 필터 — 전체(all)는 기본값이라 URL 키를 생략한다 */
export type PaymentStatusFilter = "all" | PaymentStatus;

export interface PaymentHistoryItem {
  id: string;
  /** 결제일시 (KST — 'YYYY-MM-DDTHH:mm') */
  paidAt: string;
  /** 확인서 번호 (예: KAISA-2026-0004821) */
  certificateNumber: string;
  /** 교육명 */
  courseName: string;
  /** 결제수단 표기 (예: 신한카드 1234 · 간편결제 · 계좌이체) */
  method: string;
  /** 영수증(현금영수증·카드전표) URL — 결제수단 클릭 시 새 탭에서 연다 */
  receiptUrl?: string;
  /** 금액 (원) */
  amount: number;
  status: PaymentStatus;
  /** 거래 명세서 PDF URL — 없으면 백엔드 연동 전 임시 명세서로 대체 */
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

/** 목업 데이터 — Figma 노드 19:25230~19:25257 표본 + 보충 (14건 · 환불 3건) */
const MOCK_ITEMS: PaymentHistoryItem[] = [
  {
    id: "1",
    paidAt: "2026-05-14T14:22",
    certificateNumber: "KAISA-2026-0004821",
    courseName: "비파괴검사 계속교육 (정기)",
    method: "신한카드 1234",
    amount: 3000,
    status: "paid",
  },
  {
    id: "2",
    paidAt: "2026-03-05T09:40",
    certificateNumber: "KAISA-2026-0004102",
    courseName: "건설기술 계속교육 (온라인)",
    method: "신한카드 4567",
    amount: 3000,
    status: "paid",
  },
  {
    id: "3",
    paidAt: "2026-01-22T16:05",
    certificateNumber: "KAISA-2026-0003387",
    courseName: "공사비 산정 실무 교육",
    method: "간편결제",
    amount: 3000,
    status: "paid",
  },
  {
    id: "4",
    paidAt: "2025-11-02T14:22",
    certificateNumber: "KAISA-2026-0001204",
    courseName: "감리원 법정 계속교육 2차",
    method: "간편결제",
    amount: 3000,
    status: "paid",
  },
  {
    id: "5",
    paidAt: "2025-08-21T11:30",
    certificateNumber: "KAISA-2025-0002861",
    courseName: "설비공사 감리 실무협의",
    method: "계좌이체",
    amount: 3000,
    status: "paid",
  },
  {
    id: "6",
    paidAt: "2025-06-18T10:20",
    certificateNumber: "KAISA-2025-0002544",
    courseName: "환경 영향 평가 교육",
    method: "간편결제",
    amount: 3000,
    status: "paid",
  },
  {
    id: "7",
    paidAt: "2025-04-10T15:12",
    certificateNumber: "KAISA-2025-0002210",
    courseName: "토목 안전관리 세미나",
    method: "신한카드 1234",
    amount: 3000,
    status: "refunded",
  },
  {
    id: "8",
    paidAt: "2024-11-27T13:45",
    certificateNumber: "KAISA-2024-0001988",
    courseName: "전기설비 감리 교육",
    method: "신한카드 9012",
    amount: 3000,
    status: "paid",
  },
  {
    id: "9",
    paidAt: "2024-09-04T14:22",
    certificateNumber: "KAISA-2024-0001750",
    courseName: "소방설비 계속교육",
    method: "계좌이체",
    amount: 3000,
    status: "paid",
  },
  {
    id: "10",
    paidAt: "2024-03-15T09:55",
    certificateNumber: "KAISA-2024-0001207",
    courseName: "공사감독 실무 과정",
    method: "간편결제",
    amount: 3000,
    status: "paid",
  },
  {
    id: "11",
    paidAt: "2023-10-30T17:08",
    certificateNumber: "KAISA-2023-0000941",
    courseName: "품질관리 계속교육",
    method: "신한카드 3355",
    amount: 3000,
    status: "refunded",
  },
  {
    id: "12",
    paidAt: "2022-07-14T11:11",
    certificateNumber: "KAISA-2022-0000612",
    courseName: "공정관리 실무교육",
    method: "계좌이체",
    amount: 3000,
    status: "paid",
  },
  {
    id: "13",
    paidAt: "2021-03-08T14:22",
    certificateNumber: "KAISA-2025-0009917",
    courseName: "안전관리 실무 심화과정",
    method: "계좌이체",
    amount: 3000,
    status: "refunded",
  },
  {
    id: "14",
    paidAt: "2020-09-12T10:05",
    certificateNumber: "KAISA-2020-0000488",
    courseName: "건축감리 기초교육",
    method: "계좌이체",
    amount: 3000,
    status: "paid",
  },
];

const API_BASE = import.meta.env.VITE_API_URL;

/** 목업 필터링 — 기간·상태 필터 + 서버 사이드 페이지네이션 흉내 (결제일시 내림차순) */
function filterMock({
  page,
  limit,
  from,
  to,
  status,
}: PaymentHistoryListParams): PaymentHistoryListResult {
  const byDate = MOCK_ITEMS.filter((item) => {
    const paidDate = item.paidAt.slice(0, 10);
    if (from && paidDate < from) return false;
    if (to && paidDate > to) return false;
    return true;
  });
  const filtered =
    status === "all" ? byDate : byDate.filter((item) => item.status === status);

  const sorted = [...filtered].sort((a, b) =>
    a.paidAt < b.paidAt ? 1 : a.paidAt > b.paidAt ? -1 : 0,
  );

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;

  return {
    items: sorted.slice(start, start + limit),
    total,
    page: safePage,
    limit,
    totalPages,
  };
}

export async function getPaymentHistoryList(
  params: PaymentHistoryListParams,
): Promise<PaymentHistoryListResult> {
  // 백엔드 미연동 — 목업: 짧은 지연 후 필터링 결과 반환
  if (!API_BASE) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return filterMock(params);
  }

  const search = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.status !== "all") search.set("status", params.status);

  const response = await fetch(
    `${API_BASE}/api/v1/payments?${search.toString()}`,
  );
  if (!response.ok) {
    throw new Error("문제가 생겨요. 잠시 후 다시 시도해 주세요");
  }

  // TODO(백엔드 스펙 확정 후): snake_case 응답 필드 매핑·timestamptz → KST 표기 변환 조정
  return (await response.json()) as PaymentHistoryListResult;
}
