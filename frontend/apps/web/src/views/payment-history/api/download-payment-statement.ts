import type { PaymentHistoryItem } from "./get-payment-history-list";

/** Blob을 파일로 내려받는다 — anchor 경유라 교차 출처 URL도 저장된다 */
function saveBlobFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** PDF 문자열 이스케이프 — 괄호·백슬래시만 예약돼 있다 */
function escapePdfText(text: string): string {
  return text.replace(/[\\()]/g, "\\$&");
}

/**
 * 해당 건의 최소 거래 명세서 PDF 만들기 — 백엔드 연동 전 목업 대체물.
 *
 * 코어 폰트(Helvetica)만 쓴다 — 한글 폰트 임베딩이 불가해 내용은 ASCII로
 * 구성하고, 확인서 번호로 어떤 건인지 식별 가능하게 한다.
 * 백엔드 연동 후에는 statementUrl 분기만 사용된다.
 */
function buildStatementPdf(item: PaymentHistoryItem): Blob {
  const lines = [
    "Payment Statement",
    `Certificate No. ${item.certificateNumber}`,
    `Paid at ${item.paidAt.replace("T", " ")} KST`,
    `Amount KRW ${item.amount.toLocaleString("en-US")}`,
    `Status ${item.status}`,
  ];

  const textOps = lines
    .map(
      (line, index) =>
        `BT /F1 ${index === 0 ? 16 : 12} Tf 60 ${760 - index * 24} Td (${escapePdfText(line)}) Tj ET`,
    )
    .join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${textOps.length} >>\nstream\n${textOps}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

/**
 * 거래 명세서(PDF) 내려받기.
 *
 * 백엔드가 내려준 statementUrl이 있으면 blob으로 해당 PDF를 저장하고,
 * 없으면(목업) 해당 건의 정보로 만든 PDF로 대체한다.
 */
export async function downloadPaymentStatement(
  item: PaymentHistoryItem,
): Promise<void> {
  if (!item.statementUrl) {
    saveBlobFile(
      buildStatementPdf(item),
      `${item.certificateNumber}-거래명세서.pdf`,
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
