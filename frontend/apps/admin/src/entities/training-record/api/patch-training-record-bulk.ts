import { apiClient } from '@/src/shared/api'

/**
 * 일괄 수정 1행 — 전달한 필드만 바꾼다.
 * - `undefined`: 변경 없음 (요청에서 생략)
 * - `null`: 값 지우기
 */
export interface TrainingRecordBulkUpdateItem {
  id: string
  courseId?: string | null
  completionStatus?: string
  startedAt?: string | null
  endedAt?: string | null
  /** 이수 시수는 서버가 total_hours 로 함께 맞춘다 */
  totalHours?: number | null
}

export const patchTrainingRecordBulk = async (
  updates: TrainingRecordBulkUpdateItem[],
): Promise<{ ok: boolean; updated: number }> => {
  const { data } = await apiClient.patch('/training-records/bulk', {
    updates: updates.map(u => ({
      id: u.id,
      course_id: u.courseId,
      completion_status: u.completionStatus,
      started_at: u.startedAt,
      ended_at: u.endedAt,
      total_hours: u.totalHours,
    })),
  })
  return data
}
