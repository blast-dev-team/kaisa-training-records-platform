import { apiClient } from '@/src/shared/api'
import type { RegisterInput } from '../model/auth'

/** 화이트리스트 pending 이메일만 가입 가능 (비밀번호 10자 이상 영문+숫자) */
export const postRegister = async (input: RegisterInput): Promise<void> => {
  await apiClient.post('/auth/register', input)
}
