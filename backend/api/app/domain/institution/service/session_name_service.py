import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.error_codes import api_error
from app.domain.auth.model import AdminUser
from app.domain.institution.model import SessionName
from app.domain.institution.repository import (
    session_name_repository as session_name_repo,
)
from app.domain.institution.schema import (
    SessionNameCreate,
    SessionNameUpdate,
)


async def get_session_name(db: AsyncSession, session_name_id: uuid.UUID) -> SessionName:
    session_name = await session_name_repo.find_by_id(db, session_name_id)
    if session_name is None:
        raise api_error("NOT_FOUND", message="회차명을 찾을 수 없어요")
    return session_name


async def list_session_names(
    db: AsyncSession,
    search: str | None = None,
    is_active: bool | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[SessionName], int]:
    return await session_name_repo.list_session_names(
        db, search=search, is_active=is_active, page=page, limit=limit
    )


async def create_session_name(
    db: AsyncSession, data: SessionNameCreate, actor: AdminUser
) -> SessionName:
    name = data.name.strip()
    if not name:
        raise api_error("VALIDATION_ERROR", message="회차명을 입력해 주세요")
    if await session_name_repo.find_by_name(db, name):
        raise api_error(
            "VALIDATION_ERROR", status_code=409, message="이미 등록된 회차명이에요"
        )
    session_name = await session_name_repo.save(db, SessionName(name=name))
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="session_name.created",
        entity_type="session_name",
        entity_id=session_name.id,
        after={"name": session_name.name},
    )
    await db.commit()
    await db.refresh(session_name)
    return session_name


async def update_session_name(
    db: AsyncSession,
    session_name_id: uuid.UUID,
    data: SessionNameUpdate,
    actor: AdminUser,
) -> SessionName:
    session_name = await get_session_name(db, session_name_id)
    updates = data.model_dump(exclude_unset=True)
    if "name" in updates:
        name = (updates["name"] or "").strip()
        if not name:
            raise api_error("VALIDATION_ERROR", message="회차명을 입력해 주세요")
        dup = await session_name_repo.find_by_name(db, name)
        if dup and dup.id != session_name.id:
            raise api_error(
                "VALIDATION_ERROR", status_code=409, message="이미 등록된 회차명이에요"
            )
        updates["name"] = name
    for field, value in updates.items():
        setattr(session_name, field, value)
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="session_name.updated",
        entity_type="session_name",
        entity_id=session_name.id,
    )
    return await session_name_repo.commit_refresh(db, session_name)


async def delete_session_name(
    db: AsyncSession, session_name_id: uuid.UUID, actor: AdminUser
) -> None:
    session_name = await get_session_name(db, session_name_id)
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="session_name.deleted",
        entity_type="session_name",
        entity_id=session_name.id,
        before={"name": session_name.name},
    )
    # 참조 중인 과정은 session_name_id 가 NULL 이 된다 (FK SET NULL)
    await session_name_repo.delete(db, session_name)
