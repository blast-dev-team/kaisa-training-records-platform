import { apiClient } from '@/src/shared/api'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_INSTITUTIONS } from './institution-mock'

/** 기관 소프트딜리트 — 활성 과정이 남아 있으면 409 */
export const deleteInstitution = async (institutionId: string): Promise<void> => {
  if (USE_MOCK) {
    await mockDelay()
    const item = MOCK_INSTITUTIONS.find(i => i.id === institutionId)
    if (item) item.isActive = false
    return
  }
  await apiClient.delete(`/institutions/${institutionId}`)
}
