import { apiClient } from '@/src/shared/api'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import type { TraineeBulkResult, TraineeBulkUpdateInput } from '../model/trainee'
import { findTrainee } from './trainee-mock'

/** 선택 교육생 기본정보 일괄 수정 — 보낸 필드만 적용, 없는 id는 skipped. 전화는 서버에서 암호화 저장. */
export const postTraineeBulkUpdate = async (
  input: TraineeBulkUpdateInput,
): Promise<TraineeBulkResult> => {
  if (USE_MOCK) {
    await mockDelay()
    let updated = 0
    let skipped = 0
    for (const item of input.items) {
      const trainee = findTrainee(item.id)
      if (!trainee) {
        skipped += 1
        continue
      }
      if (item.name !== undefined) trainee.name = item.name
      if (item.birth_date !== undefined) trainee.birthDate = item.birth_date
      trainee.updatedAt = new Date().toISOString().slice(0, 19)
      updated += 1
    }
    return { updated, skipped }
  }
  const { data } = await apiClient.post<TraineeBulkResult>('/trainees/bulk-update', input)
  return data
}
