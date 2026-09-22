import { queryOptions } from '@tanstack/react-query'
import { getInstitutionList } from './get-institution-list'
import { getCourseList, getCourseCategories } from './get-course-list'
import { getSessionNameList } from './get-session-name-list'
import type {
  InstitutionListQuery,
  CourseListQuery,
  SessionNameListQuery,
} from './query/institution-list-query'

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
    }),
  categories: (query: { search?: string }) =>
    queryOptions({
      queryKey: [...courseQueries.all(), 'categories', query],
      queryFn: () => getCourseCategories(query.search),
    }),
}

export const sessionNameQueries = {
  all: () => ['session-names'] as const,
  lists: () => [...sessionNameQueries.all(), 'list'] as const,
  list: (query: SessionNameListQuery) =>
    queryOptions({
      queryKey: [...sessionNameQueries.lists(), query],
      queryFn: () => getSessionNameList(query),
    }),
}
