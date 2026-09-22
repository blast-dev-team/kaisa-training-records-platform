import { apiClient } from '@/src/shared/api'

/** 회차명 삭제 — 참조 중인 과정의 회차명은 NULL 이 된다 */
export const deleteSessionName = async (sessionNameId: string): Promise<void> => {
  await apiClient.delete(`/session-names/${sessionNameId}`)
}
