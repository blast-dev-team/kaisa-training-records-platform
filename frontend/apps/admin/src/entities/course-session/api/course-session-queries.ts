import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { getCourseSessionList } from './get-course-session-list'
import type { CourseSessionListQuery } from './query/course-session-list-query'

export const courseSessionQueries = {
  all: () => ['course-sessions'] as const,
  lists: () => [...courseSessionQueries.all(), 'list'] as const,
  list: (query: CourseSessionListQuery) =>
    queryOptions({
      queryKey: [...courseSessionQueries.lists(), query],
      queryFn: () => getCourseSessionList(query),
      placeholderData: (prev) => prev,
    }),
  /** 스크롤로 다음 페이지를 이어 붙이는 목록 — 일정 선택 모달용 */
  infiniteList: (query: Omit<CourseSessionListQuery, 'page'>) =>
    infiniteQueryOptions({
      queryKey: [...courseSessionQueries.lists(), 'infinite', query],
      queryFn: ({ pageParam }) => getCourseSessionList({ ...query, page: pageParam }),
      initialPageParam: 1,
      getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    }),
}
