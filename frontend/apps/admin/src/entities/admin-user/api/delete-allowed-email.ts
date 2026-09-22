import { apiClient } from '@/src/shared/api'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_ALLOWED_EMAILS } from './admin-user-mock'

/** joined(가입완료) 이메일 삭제 시도 시 서버가 거부할 수 있음 */
export const deleteAllowedEmail = async (allowedEmailId: string): Promise<void> => {
  if (USE_MOCK) {
    await mockDelay()
    const idx = MOCK_ALLOWED_EMAILS.findIndex(e => e.id === allowedEmailId)
    if (idx >= 0) MOCK_ALLOWED_EMAILS.splice(idx, 1)
    return
  }
  await apiClient.delete(`/admin-allowed-emails/${allowedEmailId}`)
}
