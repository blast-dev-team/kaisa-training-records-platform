import type { PaymentHistoryItem } from "./get-payment-history-list";
import { buildPaymentCsv, saveBlobFile } from "./download-payment-history-excel";

/**
 * 거래 명세서(PDF) 내려받기.
 *
 * 백엔드가 내려준 statementUrl이 있으면 blob으로 PDF를 저장하고, 없으면(목업)
 * 해당 건의 임시 명세서 CSV로 대체한다 — 버튼이 아무 동작 없이 보이지 않게.
 * 백엔드 연동 후에는 statementUrl 분기만 사용된다.
 */
export async function downloadPaymentStatement(
  item: PaymentHistoryItem,
): Promise<void> {
  if (!item.statementUrl) {
    const csv = buildPaymentCsv([item]);
    saveBlobFile(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `${item.certificateNumber}-거래명세서.csv`,
    );
    return;
  }

  const response = await fetch(item.statementUrl);
  if (!response.ok) {
    throw new Error("문제가 생겼어요. 잠시 후 다시 시도해 주세요");
  }

  const blob = await response.blob();
  saveBlobFile(blob, `${item.certificateNumber}-거래명세서.pdf`);
}
