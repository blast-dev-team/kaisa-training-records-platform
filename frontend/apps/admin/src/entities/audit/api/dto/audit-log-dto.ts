export interface AuditLogDto {
  id: string
  actor_admin_id: string | null
  actor_name: string | null
  action: string
  entity_type: string
  entity_id: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
}
