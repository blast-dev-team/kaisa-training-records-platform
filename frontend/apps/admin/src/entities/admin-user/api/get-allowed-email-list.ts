import { apiClient } from '@/src/shared/api'
import type { AllowedEmailDto } from './dto/admin-user-dto'
import { mapAllowedEmail } from './map-admin-user'
import type { AllowedEmail } from '../model/admin-user'

export const getAllowedEmailList = async (): Promise<AllowedEmail[]> => {
  const { data } = await apiClient.get<AllowedEmailDto[]>('/admin-allowed-emails')
  return data.map(mapAllowedEmail)
}
