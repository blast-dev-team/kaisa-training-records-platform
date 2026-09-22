import { apiClient } from '@/src/shared/api'
import type { AdminUserDto } from './dto/admin-user-dto'
import { mapAdminUser } from './map-admin-user'
import type { AdminUser, AdminUserUpdateInput } from '../model/admin-user'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_ADMIN_USERS } from './admin-user-mock'

/** 계정 수정 — 이름·역할·상태 부분 수정 (삭제 아님) */
export const patchAdminUser = async (
  adminId: string,
  input: AdminUserUpdateInput,
): Promise<AdminUser> => {
  if (USE_MOCK) {
    await mockDelay()
    const admin = MOCK_ADMIN_USERS.find(u => u.id === adminId)
    if (!admin) throw new Error('관리자를 찾을 수 없어요')
    Object.assign(admin, input)
    return { ...admin }
  }
  const { data } = await apiClient.patch<AdminUserDto>(`/admin-users/${adminId}`, input)
  return mapAdminUser(data)
}
