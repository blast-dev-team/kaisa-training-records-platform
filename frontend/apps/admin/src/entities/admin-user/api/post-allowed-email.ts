import { apiClient } from '@/src/shared/api'
import type { AllowedEmailDto } from './dto/admin-user-dto'
import { mapAllowedEmail } from './map-admin-user'
import type { AllowedEmailInput, AllowedEmail } from '../model/admin-user'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_ALLOWED_EMAILS } from './admin-user-mock'

/** 초대 — 화이트리스트 등록. pending 상태로 생성되고, 해당 이메일 가입 시 joined */
export const postAllowedEmail = async (input: AllowedEmailInput): Promise<AllowedEmail> => {
  if (USE_MOCK) {
    await mockDelay()
    const created: AllowedEmail = {
      id: `eml-${Date.now().toString(36)}`,
      email: input.email,
      note: input.note ?? null,
      status: 'pending',
      createdAt: new Date().toISOString().slice(0, 19),
    }
    MOCK_ALLOWED_EMAILS.push(created)
    return { ...created }
  }
  const { data } = await apiClient.post<AllowedEmailDto>('/admin-allowed-emails', input)
  return mapAllowedEmail(data)
}
