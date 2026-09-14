import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.error_codes import api_error
from app.domain.auth.model import AdminUser
from app.domain.institution.model import TrainingCourse, TrainingInstitution
from app.domain.institution.repository import institution_repository as repo
from app.domain.institution.schema import (
    CourseCreate,
    CourseUpdate,
    InstitutionCreate,
    InstitutionUpdate,
)


async def get_institution(
    db: AsyncSession, institution_id: uuid.UUID
) -> TrainingInstitution:
    institution = await repo.find_institution_by_id(db, institution_id)
    if institution is None:
        raise api_error("NOT_FOUND")
    return institution


async def list_institutions(
    db: AsyncSession, is_active: bool | None = None, search: str | None = None
) -> list[TrainingInstitution]:
    return await repo.list_institutions(db, is_active=is_active, search=search)


async def create_institution(
    db: AsyncSession, data: InstitutionCreate, actor: AdminUser
) -> TrainingInstitution:
    if data.institution_code and await repo.find_institution_by_code(
        db, data.institution_code
    ):
        raise api_error(
            "VALIDATION_ERROR", status_code=409, message="이미 등록된 기관 코드예요"
        )
    institution = TrainingInstitution(**data.model_dump())
    db.add(institution)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="institution.created",
        entity_type="training_institution",
        entity_id=institution.id,
        after={"name": institution.name},
    )
    await db.commit()
    await db.refresh(institution)
    return institution


async def update_institution(
    db: AsyncSession,
    institution_id: uuid.UUID,
    data: InstitutionUpdate,
    actor: AdminUser,
) -> TrainingInstitution:
    institution = await get_institution(db, institution_id)
    before = {"name": institution.name, "is_active": institution.is_active}
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(institution, field, value)
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="institution.updated",
        entity_type="training_institution",
        entity_id=institution.id,
        before=before,
        after={"name": institution.name, "is_active": institution.is_active},
    )
    await db.commit()
    await db.refresh(institution)
    return institution


# ── 과정 (기관 하위 마스터) ─────────────────────────────────────────────────────


async def get_course(db: AsyncSession, course_id: uuid.UUID) -> TrainingCourse:
    course = await repo.find_course_by_id(db, course_id)
    if course is None:
        raise api_error("NOT_FOUND")
    return course


async def list_courses(
    db: AsyncSession,
    institution_id: uuid.UUID | None = None,
    is_active: bool | None = None,
) -> list[TrainingCourse]:
    return await repo.list_courses(
        db, institution_id=institution_id, is_active=is_active
    )


async def create_course(
    db: AsyncSession, data: CourseCreate, actor: AdminUser
) -> TrainingCourse:
    institution = await repo.find_institution_by_id(db, data.institution_id)
    if institution is None:
        raise api_error("NOT_FOUND", message="교육기관을 찾을 수 없어요")
    if data.course_code and await repo.find_course_by_code(db, data.course_code):
        raise api_error(
            "VALIDATION_ERROR", status_code=409, message="이미 등록된 과정 코드예요"
        )
    course = TrainingCourse(**data.model_dump())
    db.add(course)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="course.created",
        entity_type="training_course",
        entity_id=course.id,
        after={"name": course.name, "institution_id": str(course.institution_id)},
    )
    await db.commit()
    await db.refresh(course)
    return course


async def update_course(
    db: AsyncSession, course_id: uuid.UUID, data: CourseUpdate, actor: AdminUser
) -> TrainingCourse:
    course = await get_course(db, course_id)
    before = {"name": course.name, "is_active": course.is_active}
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(course, field, value)
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="course.updated",
        entity_type="training_course",
        entity_id=course.id,
        before=before,
        after={"name": course.name, "is_active": course.is_active},
    )
    await db.commit()
    await db.refresh(course)
    return course
