import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.identity.model import IdentityReview, IdentityVerification
from app.domain.trainee.model import Trainee
from app.domain.user.model import User


async def find_user_by_ci_hash(db: AsyncSession, ci_hash: str) -> User | None:
    result = await db.execute(select(User).where(User.ci_hash == ci_hash))
    return result.scalar_one_or_none()


async def find_trainee_by_user_id(
    db: AsyncSession, user_id: uuid.UUID
) -> Trainee | None:
    result = await db.execute(
        select(Trainee).where(
            Trainee.user_id == user_id, Trainee.deleted_at.is_(None)
        )
    )
    return result.scalar_one_or_none()


async def find_pending_manual_review(
    db: AsyncSession, user_id: uuid.UUID
) -> IdentityReview | None:
    """대기 중 심사 건 — 재인증 시 새로 만들지 않고 이 건에 최신 인증을 연결한다."""
    result = await db.execute(
        select(IdentityReview)
        .where(IdentityReview.user_id == user_id, IdentityReview.status == "manual_review")
        .order_by(IdentityReview.created_at.desc())
        .limit(1)
    )
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
    search: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[IdentityReview], int]:
    stmt = select(IdentityReview)
    count_stmt = select(func.count()).select_from(IdentityReview)
    if status:
        stmt = stmt.where(IdentityReview.status == status)
        count_stmt = count_stmt.where(IdentityReview.status == status)
    if search:
        # 계정명(users) · 인증 성명(identity_verifications.verified_name)
        pattern = f"%{search}%"
        cond = or_(
            IdentityReview.user.has(User.name.ilike(pattern)),
            IdentityReview.identity_verification.has(
                IdentityVerification.verified_name.ilike(pattern)
            ),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(IdentityReview.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total
