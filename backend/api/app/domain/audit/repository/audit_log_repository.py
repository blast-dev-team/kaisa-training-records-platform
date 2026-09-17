import uuid

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.audit.model import AuditLog
from app.domain.auth.model import AdminUser


def _search_clause(tokens: list[str]):
    """토큰 간 OR — 액션·엔티티 타입·엔티티ID·관리자명·변경 전후 JSON 부분 일치.

    관리자명은 EXISTS 서브쿼리로 검사 (eager join 을 where 에 재사용하지 않기 위함).
    """
    conds = []
    for token in tokens:
        pattern = f"%{token}%"
        actor_name_matches = (
            select(AdminUser.id)
            .where(
                AdminUser.id == AuditLog.actor_admin_id,
                AdminUser.name.ilike(pattern),
            )
            .exists()
        )
        conds.append(
            or_(
                AuditLog.action.ilike(pattern),
                AuditLog.entity_type.ilike(pattern),
                cast(AuditLog.entity_id, String).ilike(pattern),
                cast(AuditLog.before_data, String).ilike(pattern),
                cast(AuditLog.after_data, String).ilike(pattern),
                actor_name_matches,
            )
        )
    return or_(*conds)


async def list_logs(
    db: AsyncSession,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    actor_admin_id: uuid.UUID | None = None,
    q: str | None = None,
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

    # FE 가 한국어 라벨을 원본 토큰으로 풀어 쉼표로 이어 보낸다 (예: "수강생" → trainee.updated,trainee)
    tokens = [t.strip().lower() for t in (q or "").split(",") if t.strip()]
    if tokens:
        clause = _search_clause(tokens)
        stmt = stmt.where(clause)
        count_stmt = count_stmt.where(clause)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total
