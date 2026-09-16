import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { AuditLogDto } from './dto/audit-log-dto'
import { mapAuditLog } from './map-audit-log'
import type { AuditLogListQuery } from './query/audit-log-list-query'
import type { AuditLog } from '../model/audit-log'
import { USE_MOCK, mockDelay, mockPage } from '@/src/shared/api/mock'
import { MOCK_AUDIT_LOGS } from './audit-mock'

export const getAuditLogList = async (query: AuditLogListQuery): Promise<Paged<AuditLog>> => {
  if (USE_MOCK) {
    await mockDelay()
    const filtered = MOCK_AUDIT_LOGS.filter(
      log =>
        (!query.entityType || log.entityType === query.entityType) &&
        (!query.entityId || log.entityId === query.entityId) &&
        (!query.actorAdminId || log.actorAdminId === query.actorAdminId),
    )
    return mockPage(filtered, query.page, query.limit)
  }
  const { data } = await apiClient.get<PagedResponse<AuditLogDto>>('/audit-logs', {
    params: {
      entity_type: query.entityType || undefined,
      entity_id: query.entityId || undefined,
      actor_admin_id: query.actorAdminId || undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    },
  })
  return {
    items: data.items.map(mapAuditLog),
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.total_pages,
  }
}
