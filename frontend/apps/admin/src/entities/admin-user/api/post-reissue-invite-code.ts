import { apiClient } from '@/src/shared/api'
import type { AllowedEmailInviteDto } from './dto/admin-user-dto'
import { mapAllowedEmail } from './map-admin-user'
import type { AllowedEmailInvite } from '../model/admin-user'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_ALLOWED_EMAILS } from './admin-user-mock'

/** 초대 코드 재발급(super 전용) — 분실·만료 대응. 이전 코드는 즉시 무효 */
export const postReissueInviteCode = async (
  allowedEmailId: string,
): Promise<AllowedEmailInvite> => {
  if (USE_MOCK) {
    await mockDelay()
    const found = MOCK_ALLOWED_EMAILS.find((e) => e.id === allowedEmailId)
    if (!found) throw new Error('초대를 찾을 수 없어요')
    return { ...found, inviteCode: 'MOCK-CODE-1111' }
  }
  const { data } = await apiClient.post<AllowedEmailInviteDto>(
    `/admin-allowed-emails/${allowedEmailId}/invite-code`,
  )
  return { ...mapAllowedEmail(data), inviteCode: data.invite_code }
}
