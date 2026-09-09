import type { TrainingRecordDto } from './dto/training-record-dto'
import type { TrainingRecord } from '../model/training-record'

export function mapTrainingRecord(dto: TrainingRecordDto): TrainingRecord {
  return {
    id: dto.id,
    traineeId: dto.trainee_id,
    traineeName: dto.trainee_name,
    traineeNo: dto.trainee_no,
    courseId: dto.course_id,
    institutionId: dto.institution_id,
    courseName: dto.course_name,
    institutionName: dto.institution_name,
    totalHours: dto.total_hours,
    completedHours: dto.completed_hours,
    startedAt: dto.started_at,
    endedAt: dto.ended_at,
    source: dto.source,
    completionStatus: dto.completion_status,
    memo: dto.memo,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}
