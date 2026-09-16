/**
 * 교육이력 파일 다운로드 — 실제 백엔드 연동 (USE_MOCK 예외, 목록 API 참고).
 *
 * 서버가 S3 presigned URL을 내려주면 blob으로 내려받아 저장한다 (교차 출처
 * URL도 download 속성 우회 없이 저장되도록 blob 경유).
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function downloadTrainingRecordPdf(
  recordId: string,
  fallbackFileName: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/me/training-records/${recordId}/download`,
    { credentials: "include" },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message ?? "문제가 생겼어요. 잠시 후 다시 시도해 주세요");
  }

  const fileResponse = await fetch(body.url);
  if (!fileResponse.ok) {
    throw new Error("문제가 생겼어요. 잠시 후 다시 시도해 주세요");
  }
  const blob = await fileResponse.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = body.file_name || fallbackFileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
