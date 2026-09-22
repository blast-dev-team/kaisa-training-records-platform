import { apiClient } from '@/src/shared/api'
import type { PasswordChangeInput } from '../model/auth'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'

/** 본인 비밀번호 변경 — 현재 비밀번호 검증 후 교체 (실패 시 ApiError) */
export const patchMyPassword = async (input: PasswordChangeInput): Promise<void> => {
  if (USE_MOCK) {
    await mockDelay()
    return
  }
  await apiClient.patch('/auth/password', input)
}
