import { apiClient } from '@/src/shared/api'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_TRAINEES } from './trainee-mock'

/** 교육생 소프트딜리트 — 진행 중 신청·미결제 결제가 있으면 409 */
export const deleteTrainee = async (traineeId: string): Promise<void> => {
  if (USE_MOCK) {
    await mockDelay()
    const idx = MOCK_TRAINEES.findIndex(t => t.id === traineeId)
    if (idx >= 0) MOCK_TRAINEES.splice(idx, 1)
    return
  }
  await apiClient.delete(`/trainees/${traineeId}`)
}
