import { apiClient } from '@/src/shared/api'

/** 일괄 삭제 — 연결된 이력은 보존되고 연결만 끊긴다 (단건 삭제와 동일) */
export const deleteCourseSessionBulk = async (ids: string[]): Promise<number> => {
  const { data } = await apiClient.delete<{ deleted: number }>('/course-sessions/bulk', {
    data: { ids },
  })
  return data.deleted
}
