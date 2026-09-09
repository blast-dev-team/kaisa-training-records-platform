import { queryOptions } from '@tanstack/react-query'
import { getInstitutionList } from './get-institution-list'
import { getCourseList } from './get-course-list'
import type { InstitutionListQuery, CourseListQuery } from './query/institution-list-query'

export const institutionQueries = {
  all: () => ['institutions'] as const,
  lists: () => [...institutionQueries.all(), 'list'] as const,
  list: (query: InstitutionListQuery) =>
    queryOptions({
      queryKey: [...institutionQueries.lists(), query],
      queryFn: () => getInstitutionList(query),
      staleTime: 5 * 60 * 1000,
    }),
}

export const courseQueries = {
  all: () => ['courses'] as const,
  lists: () => [...courseQueries.all(), 'list'] as const,
  list: (query: CourseListQuery) =>
    queryOptions({
      queryKey: [...courseQueries.lists(), query],
      queryFn: () => getCourseList(query),
      staleTime: 5 * 60 * 1000,
    }),
}
