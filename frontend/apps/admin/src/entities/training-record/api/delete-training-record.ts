import { apiClient } from '@/src/shared/api'

/** 소프트딜리트 */
export const deleteTrainingRecord = async (recordId: string): Promise<void> => {
  await apiClient.delete(`/training-records/${recordId}`)
}
