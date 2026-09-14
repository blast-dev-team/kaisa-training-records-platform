import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.institution.model import TrainingCourse, TrainingInstitution


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
    db: AsyncSession, is_active: bool | None = None, search: str | None = None
) -> list[TrainingInstitution]:
    stmt = select(TrainingInstitution)
    if is_active is not None:
        stmt = stmt.where(TrainingInstitution.is_active == is_active)
    if search:
        stmt = stmt.where(TrainingInstitution.name.ilike(f"%{search}%"))
    stmt = stmt.order_by(TrainingInstitution.name.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


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
) -> list[TrainingCourse]:
    stmt = select(TrainingCourse)
    if institution_id is not None:
        stmt = stmt.where(TrainingCourse.institution_id == institution_id)
    if is_active is not None:
        stmt = stmt.where(TrainingCourse.is_active == is_active)
    stmt = stmt.order_by(TrainingCourse.name.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())
