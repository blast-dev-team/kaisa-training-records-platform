import { apiClient } from '@/src/shared/api'
import type { CourseSessionBulkUpdateInput } from '../model/course-session'

/** 일괄 저장 — 항목마다 담긴 필드만 해당 일정에 적용 (미포함 필드는 변경 없음) */
export const patchCourseSessionBulk = async (
  body: CourseSessionBulkUpdateInput,
): Promise<number> => {
  const { data } = await apiClient.patch<{ updated: number }>('/course-sessions/bulk', body)
  return data.updated
}
