import { apiClient } from '@/src/shared/api'

/** 일정 → 교육생 일괄 연결 — 중복 연결은 서버가 건너뛴다. 시수는 일정 총 시수로 채워진다 */
export const postTrainingRecordBulk = async (body: {
  session_id: string
  trainee_ids: string[]
  completion_status?: 'in_progress' | 'completed' | 'canceled'
  memo?: string | null
}): Promise<{ created: number; skipped: number; external_cap_excluded?: string[] }> => {
  const { data } = await apiClient.post<{
    created: number
    skipped: number
    /** 외부교육 최근 3년 한도(16시간) 초과로 연결하지 않은 교육생 이름 */
    external_cap_excluded?: string[]
  }>(
    '/training-records/bulk',
    body,
  )
  return data
}
