import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.institution.model import SessionName


async def find_by_id(db: AsyncSession, session_name_id: uuid.UUID) -> SessionName | None:
    return await db.get(SessionName, session_name_id)


async def find_by_name(db: AsyncSession, name: str) -> SessionName | None:
    result = await db.execute(select(SessionName).where(SessionName.name == name))
    return result.scalar_one_or_none()


async def list_session_names(
    db: AsyncSession,
    search: str | None = None,
    is_active: bool | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[SessionName], int]:
    stmt = select(SessionName)
    count_stmt = select(func.count()).select_from(SessionName)
    if search:
        stmt = stmt.where(SessionName.name.ilike(f"%{search}%"))
        count_stmt = count_stmt.where(SessionName.name.ilike(f"%{search}%"))
    if is_active is not None:
        stmt = stmt.where(SessionName.is_active == is_active)
        count_stmt = count_stmt.where(SessionName.is_active == is_active)
    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(SessionName.name.asc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total


async def save(db: AsyncSession, session_name: SessionName) -> SessionName:
    db.add(session_name)
    await db.flush()
    return session_name


async def commit_refresh(db: AsyncSession, session_name: SessionName) -> SessionName:
    await db.commit()
    await db.refresh(session_name)
    return session_name


async def delete(db: AsyncSession, session_name: SessionName) -> None:
    await db.delete(session_name)
    await db.commit()
