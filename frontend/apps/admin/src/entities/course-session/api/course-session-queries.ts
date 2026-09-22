import { queryOptions } from '@tanstack/react-query'
import { getCourseSessionList } from './get-course-session-list'
import type { CourseSessionListQuery } from './query/course-session-list-query'

export const courseSessionQueries = {
  all: () => ['course-sessions'] as const,
  lists: () => [...courseSessionQueries.all(), 'list'] as const,
  list: (query: CourseSessionListQuery) =>
    queryOptions({
      queryKey: [...courseSessionQueries.lists(), query],
      queryFn: () => getCourseSessionList(query),
    }),
}
