import { apiClient } from '@/src/shared/api'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_TRAINING_RECORDS } from './training-record-mock'

/** 일괄 소프트딜리트 — 단건 삭제와 동일, 삭제된 건수를 돌려준다 */
export const deleteTrainingRecordBulk = async (ids: string[]): Promise<number> => {
  if (USE_MOCK) {
    await mockDelay()
    const idSet = new Set(ids)
    const before = MOCK_TRAINING_RECORDS.length
    for (let i = MOCK_TRAINING_RECORDS.length - 1; i >= 0; i -= 1) {
      const row = MOCK_TRAINING_RECORDS[i]
      if (row && idSet.has(row.id)) MOCK_TRAINING_RECORDS.splice(i, 1)
    }
    return before - MOCK_TRAINING_RECORDS.length
  }
  const { data } = await apiClient.delete<{ ok: boolean; deleted: number }>(
    '/training-records/bulk',
    { data: { ids } },
  )
  return data.deleted
}
