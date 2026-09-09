import { apiClient } from '@/src/shared/api'
import type { AdminUserDto } from './dto/admin-user-dto'
import { mapAdminUser } from './map-admin-user'
import type { AdminUser } from '../model/admin-user'

/** super 전용 */
export const getAdminUserList = async (): Promise<AdminUser[]> => {
  const { data } = await apiClient.get<AdminUserDto[]>('/admin-users')
  return data.map(mapAdminUser)
}
