/**
 * 수료증 발급 API — 백엔드 POST /api/me/completion-certificates.
 *
 * 내부 기관 수료내역 전용, 결제 없이 무료. 1 이력 = 1 수료증이고 이미 발급된
 * 건은 기존 수료증을 그대로 반환한다(멱등). 데모 이력은 서버가 소유 검사로 거른다.
 */

/** 수료증 — 스냅샷이므로 이력이 바뀌어도 발급 시점 값 그대로다 */
export interface CompletionCertificate {
  id: string;
  certificateNo: string;
  trainingRecordId: string;
  traineeId: string;
  traineeName: string | null;
  traineeBirthDate: string | null;
  courseName: string;
  sessionName: string | null;
  institutionName: string;
  completedHours: number | null;
  startedAt: string | null;
  endedAt: string | null;
  issuedAt: string;
  status: string;
}

/** 백엔드 응답 — snake_case 그대로 */
interface CompletionCertificateDto {
  id: string;
  certificate_no: string;
  training_record_id: string;
  trainee_id: string;
  trainee_name: string | null;
  trainee_birth_date: string | null;
  course_name: string;
  session_name: string | null;
  institution_name: string;
  completed_hours: string | number;
  started_at: string | null;
  ended_at: string | null;
  issued_at: string;
  status: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function postCompletionCertificates(
  trainingRecordIds: string[],
): Promise<CompletionCertificate[]> {
  const response = await fetch(`${API_BASE}/api/me/completion-certificates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ training_record_ids: trainingRecordIds }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.message ?? "문제가 생겼어요. 잠시 후 다시 시도해 주세요",
    );
  }
  const data: CompletionCertificateDto[] = await response.json();
  return data.map((dto) => ({
    id: dto.id,
    certificateNo: dto.certificate_no,
    trainingRecordId: dto.training_record_id,
    traineeId: dto.trainee_id,
    traineeName: dto.trainee_name,
    traineeBirthDate: dto.trainee_birth_date,
    courseName: dto.course_name,
    sessionName: dto.session_name,
    institutionName: dto.institution_name,
    completedHours:
      dto.completed_hours != null ? Number(dto.completed_hours) : null,
    startedAt: dto.started_at,
    endedAt: dto.ended_at,
    issuedAt: dto.issued_at,
    status: dto.status,
  }));
}
