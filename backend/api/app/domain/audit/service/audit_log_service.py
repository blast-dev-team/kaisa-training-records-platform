import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.audit.model import AuditLog
from app.domain.audit.repository import audit_log_repository as repo


async def list_logs(
    db: AsyncSession,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    actor_admin_id: uuid.UUID | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[AuditLog], int]:
    return await repo.list_logs(
        db,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_admin_id=actor_admin_id,
        page=page,
        limit=limit,
    )
