import { apiClient } from '@/src/shared/api'
import type { AllowedEmailDto } from './dto/admin-user-dto'
import { mapAllowedEmail } from './map-admin-user'
import type { AllowedEmailInput, AllowedEmail } from '../model/admin-user'

/** 초대 — 화이트리스트 등록. pending 상태로 생성되고, 해당 이메일 가입 시 joined */
export const postAllowedEmail = async (input: AllowedEmailInput): Promise<AllowedEmail> => {
  const { data } = await apiClient.post<AllowedEmailDto>('/admin-allowed-emails', input)
  return mapAllowedEmail(data)
}
