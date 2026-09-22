export interface AuditLog {
  id: string
  actorAdminId: string | null
  actorName: string | null
  action: string
  entityType: string
  entityId: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  createdAt: string
}
