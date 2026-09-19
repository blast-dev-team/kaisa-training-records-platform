import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { CourseDto } from './dto/institution-dto'
import { mapCourse } from './map-institution'
import type { CourseListQuery } from './query/institution-list-query'
import type { Course } from '../model/institution'

export const getCourseList = async (query: CourseListQuery): Promise<Paged<Course>> => {
  const { data } = await apiClient.get<PagedResponse<CourseDto>>('/courses', {
    params: {
      institution_id: query.institutionId || undefined,
      is_active: query.isActive,
      search: query.search || undefined,
      category: query.category || undefined,
      is_external: query.isExternal,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    },
  })
  return {
    items: data.items.map(mapCourse),
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.total_pages,
  }
}

/** 분류 드롭다운 — distinct category 값 */
export const getCourseCategories = async (search?: string): Promise<string[]> => {
  const { data } = await apiClient.get<string[]>('/courses/categories', {
    params: { search: search || undefined },
  })
  return data
}
