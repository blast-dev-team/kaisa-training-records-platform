import { apiClient } from '@/src/shared/api'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_TRAINING_RECORDS } from './training-record-mock'

/** 소프트딜리트 */
export const deleteTrainingRecord = async (recordId: string): Promise<void> => {
  if (USE_MOCK) {
    await mockDelay()
    const idx = MOCK_TRAINING_RECORDS.findIndex(r => r.id === recordId)
    if (idx >= 0) MOCK_TRAINING_RECORDS.splice(idx, 1)
    return
  }
  await apiClient.delete(`/training-records/${recordId}`)
}
