import { apiClient } from '@/src/shared/api'
import type { CourseDto } from './dto/institution-dto'
import { mapCourse } from './map-institution'
import type { CourseListQuery } from './query/institution-list-query'
import type { Course } from '../model/institution'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_COURSES } from './institution-mock'

export const getCourseList = async (query: CourseListQuery): Promise<Course[]> => {
  if (USE_MOCK) {
    await mockDelay()
    return MOCK_COURSES.filter(
      c =>
        (query.isActive === undefined || c.isActive === query.isActive) &&
        (!query.institutionId || c.institutionId === query.institutionId) &&
        (!query.search || c.name.toLowerCase().includes(query.search.toLowerCase())),
    )
  }
  const { data } = await apiClient.get<CourseDto[]>('/courses', {
    params: {
      institution_id: query.institutionId || undefined,
      is_active: query.isActive,
      search: query.search || undefined,
    },
  })
  return data.map(mapCourse)
}
