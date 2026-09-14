import type { AuditLogDto } from './dto/audit-log-dto'
import type { AuditLog } from '../model/audit-log'

export function mapAuditLog(dto: AuditLogDto): AuditLog {
  return {
    id: dto.id,
    actorAdminId: dto.actor_admin_id,
    actorName: dto.actor_name,
    action: dto.action,
    entityType: dto.entity_type,
    entityId: dto.entity_id,
    before: dto.before,
    after: dto.after,
    createdAt: dto.created_at,
  }
}
