import { apiClient } from '@/src/shared/api'
import type { MeDto } from './dto/auth-dto'
import { mapMe } from './map-auth'
import type { Me } from '../model/auth'

export const getMe = async (): Promise<Me> => {
  const { data } = await apiClient.get<MeDto>('/auth/me')
  return mapMe(data)
}
