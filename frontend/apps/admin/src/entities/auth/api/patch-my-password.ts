import { apiClient } from '@/src/shared/api'
import type { PasswordChangeInput } from '../model/auth'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'

/** 본인 비밀번호 변경 — 현재 비밀번호 검증 후 교체 (실패 시 ApiError) */
export const patchMyPassword = async (input: PasswordChangeInput): Promise<void> => {
  if (USE_MOCK) {
    await mockDelay()
    return
  }
  // BE 스키마는 snake_case(current_password·new_password) — camelCase 그대로 보내면 항상 422
  await apiClient.patch('/auth/password', {
    current_password: input.currentPassword,
    new_password: input.newPassword,
  })
}
