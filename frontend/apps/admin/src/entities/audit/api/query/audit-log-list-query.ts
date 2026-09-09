export interface AuditLogListQuery {
  entityType?: string
  entityId?: string
  actorAdminId?: string
  page?: number
  limit?: number
}
