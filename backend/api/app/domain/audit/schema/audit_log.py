import uuid
from datetime import datetime

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    actor_admin_id: uuid.UUID | None
    actor_name: str | None = None
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    before: dict | None = None
    after: dict | None = None
    created_at: datetime

    @classmethod
    def from_orm(cls, log) -> "AuditLogResponse":
        return cls(
            id=log.id,
            actor_admin_id=log.actor_admin_id,
            actor_name=log.actor.name if log.actor else None,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            before=log.before_data,
            after=log.after_data,
            created_at=log.created_at,
        )
