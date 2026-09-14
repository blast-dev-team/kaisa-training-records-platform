import { apiClient } from '@/src/shared/api'
import type { TrainingRecordDto } from './dto/training-record-dto'
import { mapTrainingRecord } from './map-training-record'
import type { TrainingRecordInput, TrainingRecord } from '../model/training-record'

/** 이력 등록 — internal/external 동일 경로 (source로 구분) */
export const postTrainingRecord = async (input: TrainingRecordInput): Promise<TrainingRecord> => {
  const { data } = await apiClient.post<TrainingRecordDto>('/training-records', input)
  return mapTrainingRecord(data)
}
