import { apiClient } from '@/src/shared/api'
import type { AdminUserDto } from './dto/admin-user-dto'
import { mapAdminUser } from './map-admin-user'
import type { AdminStatus, AdminUser } from '../model/admin-user'

/** 계정 차단/복구 — 삭제 아님 */
export const patchAdminUser = async (
  adminId: string,
  status: AdminStatus,
): Promise<AdminUser> => {
  const { data } = await apiClient.patch<AdminUserDto>(`/admin-users/${adminId}`, { status })
  return mapAdminUser(data)
}
