import type { IssuanceResult } from './get-issuance-result';

/**
 * 확인서 PDF 다운로드.
 *
 * 백엔드가 내려준 pdfUrl이 있으면 blob으로 내려받는다 (교차 출처 URL도
 * download 속성 우회 없이 저장되도록 blob 경유).
 * pdfUrl이 없으면(목업) false를 반환 — 호출측에서 인쇄 대화상자로 대체한다.
 * 브라우저 인쇄의 'PDF로 저장'으로 같은 결과를 만들 수 있어서.
 *
 * @returns 다운로드를 시작했으면 true, 인쇄 폴백이 필요하면 false
 */
export async function downloadCertificatePdf(
  result: IssuanceResult,
): Promise<boolean> {
  if (!result.pdfUrl) {
    return false;
  }

  const response = await fetch(result.pdfUrl);
  if (!response.ok) {
    throw new Error('문제가 생겼어요. 잠시 후 다시 시도해 주세요');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${result.certificateNumber}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}
