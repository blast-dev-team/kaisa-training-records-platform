import { apiClient } from '@/src/shared/api'

/** 일정 → 교육생 일괄 연결 — 중복 연결은 서버가 건너뛴다 */
export const postTrainingRecordBulk = async (body: {
  session_id: string
  trainee_ids: string[]
  completed_hours?: number | null
  completion_status?: 'in_progress' | 'completed' | 'canceled'
  memo?: string | null
}): Promise<{ created: number; skipped: number }> => {
  const { data } = await apiClient.post<{ created: number; skipped: number }>(
    '/training-records/bulk',
    body,
  )
  return data
}
