import { apiClient } from '@/src/shared/api'
import type { AllowedEmailInviteDto } from './dto/admin-user-dto'
import { mapAllowedEmail } from './map-admin-user'
import type { AllowedEmailInput, AllowedEmail, AllowedEmailInvite } from '../model/admin-user'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_ALLOWED_EMAILS } from './admin-user-mock'

/** 초대 — 화이트리스트 등록 + 1회용 가입 코드 발급(super 전용). 해당 이메일 가입 시 joined */
export const postAllowedEmail = async (input: AllowedEmailInput): Promise<AllowedEmailInvite> => {
  if (USE_MOCK) {
    await mockDelay()
    const created: AllowedEmail = {
      id: `eml-${Date.now().toString(36)}`,
      email: input.email,
      note: input.note ?? null,
      status: 'pending',
      inviteExpiresAt: null,
      createdAt: new Date().toISOString().slice(0, 19),
    }
    MOCK_ALLOWED_EMAILS.push(created)
    return { ...created, inviteCode: 'MOCK-CODE-0000' }
  }
  const { data } = await apiClient.post<AllowedEmailInviteDto>('/admin-allowed-emails', input)
  return { ...mapAllowedEmail(data), inviteCode: data.invite_code }
}
