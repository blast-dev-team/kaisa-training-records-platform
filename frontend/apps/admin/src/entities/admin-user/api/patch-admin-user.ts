import { apiClient } from '@/src/shared/api'
import type { AdminUserDto } from './dto/admin-user-dto'
import { mapAdminUser } from './map-admin-user'
import type { AdminStatus, AdminUser } from '../model/admin-user'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_ADMIN_USERS } from './admin-user-mock'

/** 계정 차단/복구 — 삭제 아님 */
export const patchAdminUser = async (
  adminId: string,
  status: AdminStatus,
): Promise<AdminUser> => {
  if (USE_MOCK) {
    await mockDelay()
    const admin = MOCK_ADMIN_USERS.find(u => u.id === adminId)
    if (!admin) throw new Error('관리자를 찾을 수 없어요')
    admin.status = status
    return { ...admin }
  }
  const { data } = await apiClient.patch<AdminUserDto>(`/admin-users/${adminId}`, { status })
  return mapAdminUser(data)
}
