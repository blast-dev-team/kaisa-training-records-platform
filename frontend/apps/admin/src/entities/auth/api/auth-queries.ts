import { queryOptions } from '@tanstack/react-query'
import { getMe } from './get-me'

export const authQueries = {
  all: () => ['auth'] as const,
  me: () =>
    queryOptions({
      queryKey: [...authQueries.all(), 'me'],
      queryFn: getMe,
      retry: false,
      staleTime: 5 * 60 * 1000,
    }),
}
