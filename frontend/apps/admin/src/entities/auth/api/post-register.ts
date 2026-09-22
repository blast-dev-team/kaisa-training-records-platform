import { apiClient } from '@/src/shared/api'
import type { RegisterInput } from '../model/auth'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'

/** 화이트리스트 pending 이메일만 가입 가능 (비밀번호 10자 이상 영문+숫자) */
export const postRegister = async (input: RegisterInput): Promise<void> => {
  if (USE_MOCK) {
    await mockDelay()
    return
  }
  await apiClient.post('/auth/register', input)
}
