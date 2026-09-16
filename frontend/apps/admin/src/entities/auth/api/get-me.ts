import { apiClient } from '@/src/shared/api'
import type { MeDto } from './dto/auth-dto'
import { mapMe } from './map-auth'
import type { Me } from '../model/auth'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_ME } from './auth-mock'

export const getMe = async (): Promise<Me> => {
  if (USE_MOCK) {
    await mockDelay()
    return MOCK_ME
  }
  const { data } = await apiClient.get<MeDto>('/auth/me')
  return mapMe(data)
}
