import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.identity.model import IdentityReview
from app.domain.trainee.model import Trainee
from app.domain.user.model import User


async def find_user_by_ci_hash(db: AsyncSession, ci_hash: str) -> User | None:
    result = await db.execute(select(User).where(User.ci_hash == ci_hash))
    return result.scalar_one_or_none()


async def find_trainee_by_user_id(
    db: AsyncSession, user_id: uuid.UUID
) -> Trainee | None:
    result = await db.execute(select(Trainee).where(Trainee.user_id == user_id))
    return result.scalar_one_or_none()


async def find_review_by_id(
    db: AsyncSession, review_id: uuid.UUID
) -> IdentityReview | None:
    result = await db.execute(
        select(IdentityReview).where(IdentityReview.id == review_id)
    )
    return result.scalar_one_or_none()


async def list_reviews(
    db: AsyncSession,
    status: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[IdentityReview], int]:
    stmt = select(IdentityReview)
    count_stmt = select(func.count()).select_from(IdentityReview)
    if status:
        stmt = stmt.where(IdentityReview.status == status)
        count_stmt = count_stmt.where(IdentityReview.status == status)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(IdentityReview.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total
