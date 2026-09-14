import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.trainee.model import MembershipGrade, Trainee


async def find_by_id(db: AsyncSession, trainee_id: uuid.UUID) -> Trainee | None:
    return await db.get(Trainee, trainee_id)


async def find_by_user_id(db: AsyncSession, user_id: uuid.UUID) -> Trainee | None:
    result = await db.execute(select(Trainee).where(Trainee.user_id == user_id))
    return result.scalar_one_or_none()


async def list_trainees(
    db: AsyncSession,
    search: str | None = None,
    review_status: str | None = None,
    grade_id: uuid.UUID | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[Trainee], int]:
    """이름/교육번 검색 — 전화번호는 암호화 저장이라 부분 검색 불가 (문서 명시)."""
    stmt = select(Trainee)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            or_(Trainee.name.ilike(pattern), Trainee.trainee_no.ilike(pattern))
        )
    if review_status:
        stmt = stmt.where(Trainee.review_status == review_status)
    if grade_id is not None:
        stmt = stmt.where(Trainee.membership_grade_id == grade_id)
    total = (
        await db.execute(select(func.count()).select_from(stmt.subquery()))
    ).scalar_one()
    stmt = (
        stmt.order_by(Trainee.created_at.desc()).offset((page - 1) * limit).limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all()), int(total)


# ── 등급 마스터 ────────────────────────────────────────────────────────────────


async def find_grade_by_id(
    db: AsyncSession, grade_id: uuid.UUID
) -> MembershipGrade | None:
    return await db.get(MembershipGrade, grade_id)


async def find_grade_by_code(db: AsyncSession, code: str) -> MembershipGrade | None:
    result = await db.execute(
        select(MembershipGrade).where(MembershipGrade.code == code)
    )
    return result.scalar_one_or_none()


async def list_grades(
    db: AsyncSession, is_active: bool | None = None
) -> list[MembershipGrade]:
    stmt = select(MembershipGrade)
    if is_active is not None:
        stmt = stmt.where(MembershipGrade.is_active == is_active)
    stmt = stmt.order_by(MembershipGrade.sort_order.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())
