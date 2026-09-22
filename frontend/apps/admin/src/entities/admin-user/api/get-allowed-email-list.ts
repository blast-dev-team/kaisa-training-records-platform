import { apiClient } from '@/src/shared/api'
import type { AllowedEmailDto } from './dto/admin-user-dto'
import { mapAllowedEmail } from './map-admin-user'
import type { AllowedEmail } from '../model/admin-user'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_ALLOWED_EMAILS } from './admin-user-mock'

export const getAllowedEmailList = async (search?: string): Promise<AllowedEmail[]> => {
  if (USE_MOCK) {
    await mockDelay()
    const q = (search ?? '').trim().toLowerCase()
    return MOCK_ALLOWED_EMAILS.filter(e => !q || e.email.toLowerCase().includes(q))
  }
  const { data } = await apiClient.get<AllowedEmailDto[]>('/admin-allowed-emails', {
    params: { search: search || undefined },
  })
  return data.map(mapAllowedEmail)
}
