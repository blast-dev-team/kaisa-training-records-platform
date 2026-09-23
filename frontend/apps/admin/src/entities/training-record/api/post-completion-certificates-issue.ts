import { apiClient } from '@/src/shared/api'
import type {
  CompletionCertificate,
  CompletionCertificateIssueInput,
} from '../model/training-record'

/** 수료증 발급 응답 원본 — snake_case 그대로 */
interface CompletionCertificateDto {
  id: string
  certificate_no: string
  training_record_id: string
  trainee_id: string
  trainee_name: string | null
  trainee_birth_date: string | null
  course_name: string
  session_name: string | null
  institution_name: string
  completed_hours: string | number
  started_at: string | null
  ended_at: string | null
  issued_at: string
  status: string
}

/** 수료증 발급 — 내부 기관 수료내역 전용. 1 이력 = 1 수료증, 기발급 건은 기존 수료증 반환 */
export const postCompletionCertificatesIssue = async (
  input: CompletionCertificateIssueInput,
): Promise<CompletionCertificate[]> => {
  const { data } = await apiClient.post<CompletionCertificateDto[]>(
    '/completion-certificates/issue',
    input,
  )
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
  }))
}
