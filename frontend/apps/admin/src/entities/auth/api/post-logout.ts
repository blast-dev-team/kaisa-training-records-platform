import * as Sentry from '@sentry/react'

import { apiClient } from '@/src/shared/api'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'

export const postLogout = async (): Promise<void> => {
  if (USE_MOCK) {
    await mockDelay()
    return
  }
  await apiClient.post('/auth/logout')
  // 로그아웃 후 에러는 회원 없이 수집
  Sentry.setUser(null)
}
