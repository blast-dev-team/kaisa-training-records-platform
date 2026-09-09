import { apiClient } from '@/src/shared/api'
import type { TrainingRecordDto } from './dto/training-record-dto'
import { mapTrainingRecord } from './map-training-record'
import type { TrainingRecordInput, TrainingRecord } from '../model/training-record'

export const patchTrainingRecord = async (
  recordId: string,
  input: Partial<TrainingRecordInput>,
): Promise<TrainingRecord> => {
  const { data } = await apiClient.patch<TrainingRecordDto>(`/training-records/${recordId}`, input)
  return mapTrainingRecord(data)
}
