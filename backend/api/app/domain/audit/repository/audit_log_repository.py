import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.audit.model import AuditLog


async def list_logs(
    db: AsyncSession,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    actor_admin_id: uuid.UUID | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[AuditLog], int]:
    stmt = select(AuditLog)
    count_stmt = select(func.count()).select_from(AuditLog)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
        count_stmt = count_stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
        count_stmt = count_stmt.where(AuditLog.entity_id == entity_id)
    if actor_admin_id:
        stmt = stmt.where(AuditLog.actor_admin_id == actor_admin_id)
        count_stmt = count_stmt.where(AuditLog.actor_admin_id == actor_admin_id)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total
