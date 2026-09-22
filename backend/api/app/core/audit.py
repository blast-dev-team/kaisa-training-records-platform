"""감사 로그 기록.

db.add 만 하고 커밋은 호출자 트랜잭션에 맡긴다 — 비즈니스 변경과
감사 로그가 같은 트랜잭션에서 함께 반영되거나 함께 롤백된다.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.audit.model import AuditLog


def record_audit(
    db: AsyncSession,
    *,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None = None,
    actor_admin_id: uuid.UUID | None = None,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            actor_admin_id=actor_admin_id,
            before_data=before,
            after_data=after,
        )
    )
