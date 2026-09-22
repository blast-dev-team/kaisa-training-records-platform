import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { AuditLogDto } from './dto/audit-log-dto'
import { mapAuditLog } from './map-audit-log'
import type { AuditLogListQuery } from './query/audit-log-list-query'
import type { AuditLog } from '../model/audit-log'
import { expandSearchTokens } from '../model/audit-labels'
import { USE_MOCK, mockDelay, mockPage } from '@/src/shared/api/mock'
import { MOCK_AUDIT_LOGS } from './audit-mock'

/** 목업용 — 라벨 포함 검색 대상 텍스트 */
const logSearchText = (log: AuditLog): string =>
  [
    log.action,
    log.entityType,
    log.actorName ?? '',
    JSON.stringify(log.before ?? {}),
    JSON.stringify(log.after ?? {}),
  ]
    .join(' ')
    .toLowerCase()

export const getAuditLogList = async (query: AuditLogListQuery): Promise<Paged<AuditLog>> => {
  if (USE_MOCK) {
    await mockDelay()
    const tokens = query.q ? expandSearchTokens(query.q) : []
    const filtered = MOCK_AUDIT_LOGS.filter(
      log =>
        (!query.entityType || log.entityType === query.entityType) &&
        (!query.entityId || log.entityId === query.entityId) &&
        (!query.actorAdminId || log.actorAdminId === query.actorAdminId) &&
        (tokens.length === 0 || tokens.some(t => logSearchText(log).includes(t))),
    )
    return mockPage(filtered, query.page, query.limit)
  }
  // 한국어 라벨 검색 — 라벨을 원본 토큰으로 풀어 쉼표로 이어 BE 에 OR 검색 요청
  const tokens = query.q ? expandSearchTokens(query.q) : []
  const { data } = await apiClient.get<PagedResponse<AuditLogDto>>('/audit-logs', {
    params: {
      entity_type: query.entityType || undefined,
      entity_id: query.entityId || undefined,
      actor_admin_id: query.actorAdminId || undefined,
      q: tokens.length > 0 ? tokens.join(',') : undefined,
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
