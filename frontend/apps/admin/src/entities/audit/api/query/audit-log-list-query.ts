export interface AuditLogListQuery {
  entityType?: string
  entityId?: string
  actorAdminId?: string
  /** 검색어 — 액션·관리자·엔티티·변경 내용 (한국어 라벨 포함) */
  q?: string
  page?: number
  limit?: number
}
