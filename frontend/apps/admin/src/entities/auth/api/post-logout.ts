import { apiClient } from '@/src/shared/api'

export const postLogout = async (): Promise<void> => {
  await apiClient.post('/auth/logout')
}
