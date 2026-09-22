import { apiClient } from '@/src/shared/api'
import type { CourseSessionDto } from './dto/course-session-dto'
import { mapCourseSession } from './map-course-session'
import type { CourseSession, CourseSessionUpdateInput } from '../model/course-session'

export const patchCourseSession = async (
  sessionId: string,
  body: CourseSessionUpdateInput,
): Promise<CourseSession> => {
  const { data } = await apiClient.patch<CourseSessionDto>(`/course-sessions/${sessionId}`, body)
  return mapCourseSession(data)
}
