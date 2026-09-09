import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.core.response import PagedResponse
from app.domain.audit.schema import AuditLogResponse
from app.domain.audit.service import audit_log_service
from app.domain.auth.model import AdminUser

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=PagedResponse[AuditLogResponse])
async def list_logs(
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    actor_admin_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    logs, total = await audit_log_service.list_logs(
        db,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_admin_id=actor_admin_id,
        page=page,
        limit=limit,
    )
    return PagedResponse(
        items=[AuditLogResponse.from_orm(log) for log in logs],
        total=total,
        page=page,
        limit=limit,
    )
