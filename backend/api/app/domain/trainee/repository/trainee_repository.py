import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.trainee.model import MembershipGrade, Trainee


async def find_by_id(db: AsyncSession, trainee_id: uuid.UUID) -> Trainee | None:
    result = await db.execute(
        select(Trainee).where(
            Trainee.id == trainee_id, Trainee.deleted_at.is_(None)
        )
    )
    return result.scalar_one_or_none()


async def find_by_user_id(db: AsyncSession, user_id: uuid.UUID) -> Trainee | None:
    result = await db.execute(
        select(Trainee).where(
            Trainee.user_id == user_id, Trainee.deleted_at.is_(None)
        )
    )
    return result.scalar_one_or_none()


async def find_by_ids(
    db: AsyncSession, trainee_ids: list[uuid.UUID]
) -> list[Trainee]:
    """일괄 처리용 — 삭제되지 않은 교육생만. 없는 id 는 결과에서 빠진다."""
    if not trainee_ids:
        return []
    result = await db.execute(
        select(Trainee).where(
            Trainee.id.in_(trainee_ids), Trainee.deleted_at.is_(None)
        )
    )
    return list(result.scalars().all())


async def list_trainees(
    db: AsyncSession,
    search: str | None = None,
    review_status: str | None = None,
    grade_id: uuid.UUID | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[Trainee], int]:
    """이름/교육번 검색 — 전화번호는 암호화 저장이라 부분 검색 불가 (문서 명시)."""
    stmt = select(Trainee).where(Trainee.deleted_at.is_(None))
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                Trainee.name.ilike(pattern),
                Trainee.trainee_no.ilike(pattern),
                Trainee.cert_no.ilike(pattern),  # 감리원증번호
            )
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


async def list_cert_no_duplicates(
    db: AsyncSession,
) -> list[Trainee]:
    """감리원증번호가 중복인 교육생 — 번호 개명 등으로 발생. 관리자 수동 정리 대상."""
    dup_nos = select(Trainee.cert_no).where(
        Trainee.deleted_at.is_(None),
        Trainee.cert_no.is_not(None),
    ).group_by(Trainee.cert_no).having(func.count() > 1)
    stmt = (
        select(Trainee)
        .where(
            Trainee.deleted_at.is_(None),
            Trainee.cert_no.in_(dup_nos),
        )
        .order_by(Trainee.cert_no.asc(), Trainee.name.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


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
