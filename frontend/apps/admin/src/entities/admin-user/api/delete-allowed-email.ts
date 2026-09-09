import { apiClient } from '@/src/shared/api'

/** joined(가입완료) 이메일 삭제 시도 시 서버가 거부할 수 있음 */
export const deleteAllowedEmail = async (allowedEmailId: string): Promise<void> => {
  await apiClient.delete(`/admin-allowed-emails/${allowedEmailId}`)
}
