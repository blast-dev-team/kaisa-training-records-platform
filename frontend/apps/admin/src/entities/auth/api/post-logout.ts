import { apiClient } from '@/src/shared/api'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'

export const postLogout = async (): Promise<void> => {
  if (USE_MOCK) {
    await mockDelay()
    return
  }
  await apiClient.post('/auth/logout')
}
