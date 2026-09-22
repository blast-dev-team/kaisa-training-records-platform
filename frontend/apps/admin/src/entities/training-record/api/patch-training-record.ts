import { apiClient } from '@/src/shared/api'
import type { TrainingRecordDto } from './dto/training-record-dto'
import { mapTrainingRecord } from './map-training-record'
import type { TrainingRecordInput, TrainingRecord } from '../model/training-record'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { findTrainingRecord } from './training-record-mock'

export const patchTrainingRecord = async (
  recordId: string,
  input: Partial<TrainingRecordInput>,
): Promise<TrainingRecord> => {
  if (USE_MOCK) {
    await mockDelay()
    const record = findTrainingRecord(recordId)
    if (!record) throw new Error('교육이력을 찾을 수 없어요')
    if (input.course_name !== undefined) record.courseName = input.course_name
    if (input.institution_name !== undefined) record.institutionName = input.institution_name
    if (input.form_no !== undefined) record.formNo = input.form_no ?? null
    if (input.doc_no !== undefined) record.docNo = input.doc_no ?? null
    if (input.supervisor_grade !== undefined) record.supervisorGrade = input.supervisor_grade ?? null
    if (input.supervisor_cert_no !== undefined) record.supervisorCertNo = input.supervisor_cert_no ?? null
    if (input.total_hours !== undefined) record.totalHours = input.total_hours
    if (input.completed_hours !== undefined) record.completedHours = input.completed_hours
    if (input.started_at !== undefined) record.startedAt = input.started_at
    if (input.ended_at !== undefined) record.endedAt = input.ended_at
    if (input.completion_status !== undefined) record.completionStatus = input.completion_status
    if (input.memo !== undefined) record.memo = input.memo
    record.updatedAt = new Date().toISOString().slice(0, 19)
    return { ...record }
  }
  const { data } = await apiClient.patch<TrainingRecordDto>(`/training-records/${recordId}`, input)
  return mapTrainingRecord(data)
}
