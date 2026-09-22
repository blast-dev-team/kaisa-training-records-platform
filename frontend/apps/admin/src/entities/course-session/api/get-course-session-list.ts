import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { CourseSessionDto } from './dto/course-session-dto'
import { mapCourseSession } from './map-course-session'
import type { CourseSessionListQuery } from './query/course-session-list-query'
import type { CourseSession } from '../model/course-session'

export const getCourseSessionList = async (
  query: CourseSessionListQuery,
): Promise<Paged<CourseSession>> => {
  const { data } = await apiClient.get<PagedResponse<CourseSessionDto>>('/course-sessions', {
    params: {
      course_id: query.courseId || undefined,
      search: query.q || undefined,
      status: query.status || undefined,
      date_from: query.dateFrom || undefined,
      date_to: query.dateTo || undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    },
  })
  return {
    items: data.items.map(mapCourseSession),
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.total_pages,
  }
}
