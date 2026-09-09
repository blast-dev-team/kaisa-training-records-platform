import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { AuditLogDto } from './dto/audit-log-dto'
import { mapAuditLog } from './map-audit-log'
import type { AuditLogListQuery } from './query/audit-log-list-query'
import type { AuditLog } from '../model/audit-log'

export const getAuditLogList = async (query: AuditLogListQuery): Promise<Paged<AuditLog>> => {
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
