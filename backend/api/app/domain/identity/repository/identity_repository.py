import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import name_hash
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


# 정렬 화이트리스트 — 신청일시 / 처리일시만 허용
REVIEW_SORT_FIELDS = {
    "created_at": IdentityReview.created_at,
    "reviewed_at": IdentityReview.reviewed_at,
}


async def list_reviews(
    db: AsyncSession,
    status: str | None = None,
    search: str | None = None,
    page: int = 1,
    limit: int = 20,
    sort: str = "created_at",
    order: str = "desc",
) -> tuple[list[IdentityReview], int]:
    stmt = select(IdentityReview)
    count_stmt = select(func.count()).select_from(IdentityReview)
    if status:
        stmt = stmt.where(IdentityReview.status == status)
        count_stmt = count_stmt.where(IdentityReview.status == status)
    if search:
        # 계정명(users) · 인증 성명(identity_verifications) — 둘 다 암호화 저장이라
        # blind index 로 '전체 이름 일치'만 지원한다
        h = name_hash(search)
        cond = or_(
            IdentityReview.user.has(User.name_hash == h),
            IdentityReview.identity_verification.has(
                IdentityVerification.verified_name_hash == h
            ),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    total = (await db.execute(count_stmt)).scalar_one()
    col = REVIEW_SORT_FIELDS.get(sort, IdentityReview.created_at)
    dir = col.asc() if order == "asc" else col.desc()
    stmt = (
        # nulls_last — 처리일시 미정(null) 건이 asc 에서 맨 앞으로 오는 것 방지
        # id tiebreaker — 같은 초에 생성된 건의 순서 고정 (페이지네이션 안정화)
        stmt.order_by(dir.nulls_last(), IdentityReview.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total
