import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.domain.auth.model import AdminUser
from app.domain.institution.schema import (
    CourseCreate,
    CourseResponse,
    CourseUpdate,
    InstitutionCreate,
    InstitutionResponse,
    InstitutionUpdate,
)
from app.domain.institution.service import institution_service

router = APIRouter(prefix="/institutions", tags=["institutions"])
course_router = APIRouter(prefix="/courses", tags=["courses"])


@router.get("", response_model=list[InstitutionResponse])
async def list_institutions(
    is_active: bool | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    return await institution_service.list_institutions(
        db, is_active=is_active, search=search
    )


@router.get("/{institution_id}", response_model=InstitutionResponse)
async def get_institution(
    institution_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    return await institution_service.get_institution(db, institution_id)


@router.post("", response_model=InstitutionResponse, status_code=201)
async def create_institution(
    body: InstitutionCreate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    return await institution_service.create_institution(db, body, actor)


@router.patch("/{institution_id}", response_model=InstitutionResponse)
async def update_institution(
    institution_id: uuid.UUID,
    body: InstitutionUpdate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    return await institution_service.update_institution(db, institution_id, body, actor)


# ── 과정 (기관 하위 마스터) ─────────────────────────────────────────────────────


@course_router.get("", response_model=list[CourseResponse])
async def list_courses(
    institution_id: uuid.UUID | None = None,
    is_active: bool | None = None,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    return await institution_service.list_courses(
        db, institution_id=institution_id, is_active=is_active
    )


@course_router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    return CourseResponse.from_orm(await institution_service.get_course(db, course_id))


@course_router.post("", response_model=CourseResponse, status_code=201)
async def create_course(
    body: CourseCreate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    course = await institution_service.create_course(db, body, actor)
    return CourseResponse.from_orm(course)


@course_router.patch("/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: uuid.UUID,
    body: CourseUpdate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    course = await institution_service.update_course(db, course_id, body, actor)
    return CourseResponse.from_orm(course)
