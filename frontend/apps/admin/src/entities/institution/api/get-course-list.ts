import { apiClient } from '@/src/shared/api'
import type { CourseDto } from './dto/institution-dto'
import { mapCourse } from './map-institution'
import type { CourseListQuery } from './query/institution-list-query'
import type { Course } from '../model/institution'

export const getCourseList = async (query: CourseListQuery): Promise<Course[]> => {
  const { data } = await apiClient.get<CourseDto[]>('/courses', {
    params: {
      institution_id: query.institutionId || undefined,
      is_active: query.isActive,
    },
  })
  return data.map(mapCourse)
}
