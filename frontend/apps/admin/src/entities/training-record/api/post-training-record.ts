import { apiClient } from '@/src/shared/api'
import type { TrainingRecordDto } from './dto/training-record-dto'
import { mapTrainingRecord } from './map-training-record'
import type { TrainingRecordInput, TrainingRecord } from '../model/training-record'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { findTrainee } from '../../trainee/api/trainee-mock'
import { MOCK_TRAINING_RECORDS } from './training-record-mock'

/** 이력 등록 — internal/external 동일 경로 (source로 구분) */
export const postTrainingRecord = async (input: TrainingRecordInput): Promise<TrainingRecord> => {
  if (USE_MOCK) {
    await mockDelay()
    const trainee = findTrainee(input.trainee_id)
    const now = new Date().toISOString().slice(0, 19)
    const created: TrainingRecord = {
      id: `rcd-${Date.now().toString(36)}`,
      traineeId: input.trainee_id,
      traineeName: trainee?.name ?? null,
      traineeNo: trainee?.traineeNo ?? null,
      courseId: input.course_id ?? null,
      institutionId: input.institution_id ?? null,
      courseName: input.course_name ?? '',
      institutionName: input.institution_name ?? null,
      formNo: input.form_no ?? null,
      docNo: input.doc_no ?? null,
      supervisorGrade: input.supervisor_grade ?? null,
      supervisorCertNo: input.supervisor_cert_no ?? null,
      totalHours: input.total_hours ?? null,
      completedHours: input.completed_hours ?? null,
      startedAt: input.started_at ?? null,
      endedAt: input.ended_at ?? null,
      source: input.source,
      completionStatus: input.completion_status,
      memo: input.memo ?? null,
      createdAt: now,
      updatedAt: now,
    }
    MOCK_TRAINING_RECORDS.unshift(created)
    return { ...created }
  }
  const { data } = await apiClient.post<TrainingRecordDto>('/training-records', input)
  return mapTrainingRecord(data)
}
