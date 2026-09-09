import { queryOptions } from '@tanstack/react-query'
import { getAdminUserList } from './get-admin-user-list'
import { getAllowedEmailList } from './get-allowed-email-list'

export const adminUserQueries = {
  all: () => ['admin-users'] as const,
  lists: () => [...adminUserQueries.all(), 'list'] as const,
  list: () =>
    queryOptions({
      queryKey: [...adminUserQueries.lists()],
      queryFn: () => getAdminUserList(),
    }),
}

export const allowedEmailQueries = {
  all: () => ['admin-allowed-emails'] as const,
  lists: () => [...allowedEmailQueries.all(), 'list'] as const,
  list: () =>
    queryOptions({
      queryKey: [...allowedEmailQueries.lists()],
      queryFn: () => getAllowedEmailList(),
    }),
}
