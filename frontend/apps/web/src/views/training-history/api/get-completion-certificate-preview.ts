/**
 * 수료증 미리보기 API — 백엔드 GET /api/me/completion-certificates/preview.
 *
 * 슈퍼 계정 전용. 발급(INSERT·채번) 없이 해당 이력을 들은 교육생 데이터로
 * 수료증 문서 데이터를 조립해 돌려준다. certificate_no 는 미부여("")다.
 */

import type { CompletionCertificate } from "./post-completion-certificates";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function getCompletionCertificatePreview(
  trainingRecordId: string,
): Promise<CompletionCertificate> {
  const response = await fetch(
    `${API_BASE}/api/me/completion-certificates/preview?training_record_id=${encodeURIComponent(trainingRecordId)}`,
    { credentials: "include" },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.message ?? "문제가 생겼어요. 잠시 후 다시 시도해 주세요",
    );
  }
  const dto = await response.json();
  return {
    id: dto.id,
    certificateNo: dto.certificate_no,
    trainingRecordId: dto.training_record_id,
    traineeId: dto.trainee_id,
    traineeName: dto.trainee_name,
    traineeBirthDate: dto.trainee_birth_date,
    courseName: dto.course_name,
    sessionName: dto.session_name,
    institutionName: dto.institution_name,
    completedHours: dto.completed_hours != null ? Number(dto.completed_hours) : null,
    startedAt: dto.started_at,
    endedAt: dto.ended_at,
    issuedAt: dto.issued_at,
    status: dto.status,
  };
}
