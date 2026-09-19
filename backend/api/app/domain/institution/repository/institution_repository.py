import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.institution.model import (
    SessionName,
    TrainingCourse,
    TrainingInstitution,
)


async def find_institution_by_id(
    db: AsyncSession, institution_id: uuid.UUID
) -> TrainingInstitution | None:
    return await db.get(TrainingInstitution, institution_id)


async def find_institution_by_code(
    db: AsyncSession, code: str
) -> TrainingInstitution | None:
    result = await db.execute(
        select(TrainingInstitution).where(TrainingInstitution.institution_code == code)
    )
    return result.scalar_one_or_none()


async def list_institutions(
    db: AsyncSession,
    is_active: bool | None = None,
    search: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[TrainingInstitution], int]:
    stmt = select(TrainingInstitution)
    count_stmt = select(func.count()).select_from(TrainingInstitution)
    if is_active is not None:
        stmt = stmt.where(TrainingInstitution.is_active == is_active)
        count_stmt = count_stmt.where(TrainingInstitution.is_active == is_active)
    if search:
        pattern = f"%{search}%"
        cond = or_(
            TrainingInstitution.name.ilike(pattern),
            TrainingInstitution.institution_code.ilike(pattern),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(TrainingInstitution.name.asc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total


async def find_course_by_id(
    db: AsyncSession, course_id: uuid.UUID
) -> TrainingCourse | None:
    return await db.get(TrainingCourse, course_id)


async def find_course_by_code(db: AsyncSession, code: str) -> TrainingCourse | None:
    result = await db.execute(
        select(TrainingCourse).where(TrainingCourse.course_code == code)
    )
    return result.scalar_one_or_none()


async def list_courses(
    db: AsyncSession,
    institution_id: uuid.UUID | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    category: str | None = None,
    is_external: bool | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[TrainingCourse], int]:
    stmt = select(TrainingCourse)
    count_stmt = select(func.count()).select_from(TrainingCourse)
    if institution_id is not None:
        stmt = stmt.where(TrainingCourse.institution_id == institution_id)
        count_stmt = count_stmt.where(TrainingCourse.institution_id == institution_id)
    if is_active is not None:
        stmt = stmt.where(TrainingCourse.is_active == is_active)
        count_stmt = count_stmt.where(TrainingCourse.is_active == is_active)
    if category:
        stmt = stmt.where(TrainingCourse.category == category)
        count_stmt = count_stmt.where(TrainingCourse.category == category)
    if is_external is not None:
        stmt = stmt.where(TrainingCourse.is_external == is_external)
        count_stmt = count_stmt.where(TrainingCourse.is_external == is_external)
    if search:
        # 과정명·과정코드·회차명·기관명
        pattern = f"%{search}%"
        matched_session_names = select(SessionName.id).where(
            SessionName.name.ilike(pattern)
        )
        matched_institutions = select(TrainingInstitution.id).where(
            TrainingInstitution.name.ilike(pattern)
        )
        cond = or_(
            TrainingCourse.name.ilike(pattern),
            TrainingCourse.course_code.ilike(pattern),
            TrainingCourse.session_name_id.in_(matched_session_names),
            TrainingCourse.institution_id.in_(matched_institutions),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(TrainingCourse.name.asc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total


async def list_categories(db: AsyncSession, search: str | None = None) -> list[str]:
    """과정 분류 드롭다운용 — distinct category 값."""
    stmt = (
        select(TrainingCourse.category)
        .where(TrainingCourse.category.is_not(None))
        .distinct()
        .order_by(TrainingCourse.category.asc())
    )
    if search:
        stmt = stmt.where(TrainingCourse.category.ilike(f"%{search}%"))
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)
