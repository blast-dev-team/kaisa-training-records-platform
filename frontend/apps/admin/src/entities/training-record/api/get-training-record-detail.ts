import { apiClient } from '@/src/shared/api'
import type { TrainingRecordDto } from './dto/training-record-dto'
import { mapTrainingRecord } from './map-training-record'
import type { TrainingRecord } from '../model/training-record'

export const getTrainingRecordDetail = async (recordId: string): Promise<TrainingRecord> => {
  const { data } = await apiClient.get<TrainingRecordDto>(`/training-records/${recordId}`)
  return mapTrainingRecord(data)
}
