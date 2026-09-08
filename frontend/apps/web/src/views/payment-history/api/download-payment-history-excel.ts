import type { PaymentHistoryItem } from "./get-payment-history-list";

const CSV_HEADERS = [
  "결제일시",
  "확인서 번호",
  "교육명",
  "결제수단",
  "금액(원)",
  "상태",
] as const;

const STATUS_LABEL = { paid: "결제완료", refunded: "환불" } as const;

/** 결제일시를 'YYYY.MM.DD HH:mm' 표기로 바꾼다 */
function formatPaidAt(paidAt: string): string {
  return `${paidAt.slice(0, 10).replace(/-/g, ".")} ${paidAt.slice(11, 16)}`;
}

/** CSV 셀 이스케이프 — 쉼표·따옴표·줄바꿈 포함 시 값 전체를 쌍따옴표로 감싼다 */
function escapeCsvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * 결제 내역 CSV 만들기 — BOM(\uFEFF)을 붙여 엑셀에서 한글이 깨지지 않게 한다.
 * download-payment-statement(단건 임시 명세서)도 같은 포맷을 쓴다.
 */
export function buildPaymentCsv(items: PaymentHistoryItem[]): string {
  const rows = items.map((item) =>
    [
      formatPaidAt(item.paidAt),
      item.certificateNumber,
      item.courseName,
      item.method,
      String(item.amount),
      STATUS_LABEL[item.status],
    ]
      .map(escapeCsvCell)
      .join(","),
  );
  return `\uFEFF${CSV_HEADERS.join(",")}\n${rows.join("\n")}`;
}

/** Blob을 파일로 내려받는다 — anchor 경유라 교차 출처 URL도 저장된다 */
export function saveBlobFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** 오늘 'YYYYMMDD' — 파일명용 (로컬 기준) */
function todayCompact(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}${month}${day}`;
}

/**
 * 결제 내역 엑셀 저장 — 현재 조회 결과를 CSV로 내보낸다.
 *
 * TODO(백엔드 연동 후): 서버가 엑셀 파일을 내려주면
 * `${API_BASE}/api/v1/payments/excel` presigned URL 방식으로 교체한다.
 * 지금은 조회 결과(items)로 클라이언트에서 만든다.
 */
export function downloadPaymentHistoryExcel(items: PaymentHistoryItem[]): void {
  const csv = buildPaymentCsv(items);
  saveBlobFile(new Blob([csv], { type: "text/csv;charset=utf-8" }), `결제내역-${todayCompact()}.csv`);
}
