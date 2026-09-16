import { apiClient } from '@/src/shared/api'
import type { AllowedEmailDto } from './dto/admin-user-dto'
import { mapAllowedEmail } from './map-admin-user'
import type { AllowedEmail } from '../model/admin-user'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_ALLOWED_EMAILS } from './admin-user-mock'

export const getAllowedEmailList = async (): Promise<AllowedEmail[]> => {
  if (USE_MOCK) {
    await mockDelay()
    return [...MOCK_ALLOWED_EMAILS]
  }
  const { data } = await apiClient.get<AllowedEmailDto[]>('/admin-allowed-emails')
  return data.map(mapAllowedEmail)
}
