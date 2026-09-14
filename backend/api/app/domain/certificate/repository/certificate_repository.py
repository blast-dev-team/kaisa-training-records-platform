import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.certificate.model import Certificate


async def find_by_id(db: AsyncSession, certificate_id: uuid.UUID) -> Certificate | None:
    result = await db.execute(
        select(Certificate).where(Certificate.id == certificate_id)
    )
    return result.scalar_one_or_none()


async def find_by_no(db: AsyncSession, certificate_no: str) -> Certificate | None:
    result = await db.execute(
        select(Certificate).where(Certificate.certificate_no == certificate_no)
    )
    return result.scalar_one_or_none()


async def list_certificates(
    db: AsyncSession,
    trainee_id: uuid.UUID | None = None,
    status: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[Certificate], int]:
    stmt = select(Certificate)
    count_stmt = select(func.count()).select_from(Certificate)
    if trainee_id:
        stmt = stmt.where(Certificate.trainee_id == trainee_id)
        count_stmt = count_stmt.where(Certificate.trainee_id == trainee_id)
    if status:
        stmt = stmt.where(Certificate.status == status)
        count_stmt = count_stmt.where(Certificate.status == status)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(Certificate.issued_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total
