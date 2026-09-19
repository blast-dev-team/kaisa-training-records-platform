import { apiClient } from '@/src/shared/api'

/** 일정 삭제 — 연결된 이력은 보존되고 연결만 끊긴다 */
export const deleteCourseSession = async (sessionId: string): Promise<void> => {
  await apiClient.delete(`/course-sessions/${sessionId}`)
}
