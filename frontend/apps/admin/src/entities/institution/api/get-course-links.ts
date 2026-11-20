import { apiClient } from '@/src/shared/api'

/** 과정에 연결된 일정·교육이력 수 — 기관 변경 확인 안내용 */
export interface CourseLinks {
  sessionCount: number
  recordCount: number
}

export const getCourseLinks = async (courseId: string): Promise<CourseLinks> => {
  const { data } = await apiClient.get<{ session_count: number; record_count: number }>(
    `/courses/${courseId}/links`,
  )
  return { sessionCount: data.session_count, recordCount: data.record_count }
}
