import { queryOptions } from '@tanstack/react-query'
import { getAuditLogList } from './get-audit-log-list'
import type { AuditLogListQuery } from './query/audit-log-list-query'

export const auditLogQueries = {
  all: () => ['audit-logs'] as const,
  lists: () => [...auditLogQueries.all(), 'list'] as const,
  list: (query: AuditLogListQuery) =>
    queryOptions({
      queryKey: [...auditLogQueries.lists(), query],
      queryFn: () => getAuditLogList(query),
    }),
}
