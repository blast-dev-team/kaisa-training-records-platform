import { apiClient } from '@/src/shared/api'
import type { CourseSessionDto } from './dto/course-session-dto'
import { mapCourseSession } from './map-course-session'
import type { CourseSession, CourseSessionInput } from '../model/course-session'

export const postCourseSession = async (body: CourseSessionInput): Promise<CourseSession> => {
  const { data } = await apiClient.post<CourseSessionDto>('/course-sessions', body)
  return mapCourseSession(data)
}
