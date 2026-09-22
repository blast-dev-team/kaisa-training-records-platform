import { apiClient } from '@/src/shared/api'
import type { AdminUserDto } from './dto/admin-user-dto'
import { mapAdminUser } from './map-admin-user'
import type { AdminUser } from '../model/admin-user'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_ADMIN_USERS } from './admin-user-mock'

/** super 전용 */
export const getAdminUserList = async (): Promise<AdminUser[]> => {
  if (USE_MOCK) {
    await mockDelay()
    return [...MOCK_ADMIN_USERS]
  }
  const { data } = await apiClient.get<AdminUserDto[]>('/admin-users')
  return data.map(mapAdminUser)
}
