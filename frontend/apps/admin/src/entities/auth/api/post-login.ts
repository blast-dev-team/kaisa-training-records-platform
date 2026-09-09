import { apiClient } from '@/src/shared/api'
import type { LoginInput, Me } from '../model/auth'
import { getMe } from './get-me'

/** 로그인 → 세션 쿠키 발급 → me로 계정 정보 반환 (account_type 확인용) */
export const postLogin = async (input: LoginInput): Promise<Me> => {
  await apiClient.post('/auth/login', input)
  return getMe()
}
