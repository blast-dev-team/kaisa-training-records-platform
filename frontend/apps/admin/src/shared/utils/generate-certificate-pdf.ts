/**
 * 확인서 PDF 생성 — 문서 DOM을 캔버스로 래스터화해 A4 PDF로 저장.
 *
 * jspdf·html2canvas-pro는 클릭 시에만 로드되게 동적 import (메인 번들 제외).
 * html2canvas-pro는 Tailwind v4의 oklch 컬러를 파싱할 수 있는 포크다.
 * WEB 앱의 동일 유틸과 같은 방식 — 어드민에선 페이지 배열을 받아 한 PDF로 묶는다.
 */

/** A4 세로 1페이지 분량의 DOM을 PDF 페이지로 추가한다 */
export type PdfPageElement = HTMLElement;

export async function generateCertificatePdf(
  elements: PdfPageElement[],
  fileName: string,
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  // 문서 폰트(시스템 명조 계열) 로드가 끝난 뒤 캡처해야 글리프가 누락되지 않는다
  await document.fonts.ready;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  for (const [index, element] of elements.entries()) {
    if (index > 0) pdf.addPage();
    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
    });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297);
  }

  pdf.save(fileName);
}
