import type { TrainingRecordDto } from './dto/training-record-dto'
import type { TrainingRecord } from '../model/training-record'

export function mapTrainingRecord(dto: TrainingRecordDto): TrainingRecord {
  return {
    id: dto.id,
    traineeId: dto.trainee_id,
    traineeName: dto.trainee_name,
    traineeNo: dto.trainee_no,
    traineeCertNo: dto.trainee_cert_no,
    traineeBirthDate: dto.trainee_birth_date,
    traineePhone: dto.trainee_phone,
    courseId: dto.course_id,
    sessionId: dto.session_id,
    institutionId: dto.institution_id,
    courseName: dto.course_name,
    institutionName: dto.institution_name,
    formNo: dto.form_no,
    docNo: dto.doc_no,
    supervisorGrade: dto.supervisor_grade,
    supervisorCertNo: dto.supervisor_cert_no,
    totalHours: dto.total_hours != null ? Number(dto.total_hours) : null,
    completedHours: dto.completed_hours != null ? Number(dto.completed_hours) : null,
    startedAt: dto.started_at,
    endedAt: dto.ended_at,
    source: dto.source,
    completionStatus: dto.completion_status,
    memo: dto.memo,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}
