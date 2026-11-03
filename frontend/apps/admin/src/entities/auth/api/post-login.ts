import * as Sentry from '@sentry/react'

import { apiClient } from '@/src/shared/api'
import type { LoginInput, Me } from '../model/auth'
import { getMe } from './get-me'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_ME } from './auth-mock'

/** 로그인 → 세션 쿠키 발급 → me로 계정 정보 반환 (account_type 확인용) */
export const postLogin = async (input: LoginInput): Promise<Me> => {
  // USE_MOCK — 실계정 없이 통과 (secret manager env와 무관)
  if (USE_MOCK) {
    await mockDelay(400)
    return MOCK_ME
  }
  await apiClient.post('/auth/login', input)
  const me = await getMe()
  // Sentry 이슈별 "어떤 관리자" 식별 — 로그인 성공 시점에 사용자 태그 부착
  Sentry.setUser({ id: me.id, email: me.email, username: me.name })
  return me
}
