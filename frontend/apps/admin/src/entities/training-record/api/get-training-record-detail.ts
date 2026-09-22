import { apiClient } from '@/src/shared/api'
import type { TrainingRecordDto } from './dto/training-record-dto'
import { mapTrainingRecord } from './map-training-record'
import type { TrainingRecord } from '../model/training-record'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { findTrainingRecord } from './training-record-mock'

export const getTrainingRecordDetail = async (recordId: string): Promise<TrainingRecord> => {
  if (USE_MOCK) {
    await mockDelay()
    const found = findTrainingRecord(recordId)
    if (!found) throw new Error('교육이력을 찾을 수 없어요')
    return { ...found }
  }
  const { data } = await apiClient.get<TrainingRecordDto>(`/training-records/${recordId}`)
  return mapTrainingRecord(data)
}
