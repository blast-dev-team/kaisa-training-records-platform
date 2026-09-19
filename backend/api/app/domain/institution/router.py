import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.core.response import PagedResponse
from app.domain.auth.model import AdminUser
from app.domain.institution.schema import (
    CourseCreate,
    CourseResponse,
    CourseUpdate,
    InstitutionCreate,
    InstitutionResponse,
    InstitutionUpdate,
    SessionCreate,
    SessionNameCreate,
    SessionNameResponse,
    SessionNameUpdate,
    SessionResponse,
    SessionUpdate,
)
from app.domain.institution.service import (
    course_session_service,
    institution_service,
    session_name_service,
)

router = APIRouter(prefix="/institutions", tags=["institutions"])
course_router = APIRouter(prefix="/courses", tags=["courses"])
session_router = APIRouter(prefix="/course-sessions", tags=["courses"])
session_name_router = APIRouter(prefix="/session-names", tags=["courses"])


@router.get("", response_model=PagedResponse[InstitutionResponse])
async def list_institutions(
    is_active: bool | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    """기관명·기관코드 검색."""
    institutions, total = await institution_service.list_institutions(
        db, is_active=is_active, search=search, page=page, limit=limit
    )
    return PagedResponse(
        items=[InstitutionResponse.model_validate(i) for i in institutions],
        total=total,
        page=page,
        limit=limit,
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


@router.delete("/{institution_id}", status_code=204)
async def delete_institution(
    institution_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    """소프트딜리트 — 활성 과정이 남아 있으면 409."""
    await institution_service.delete_institution(db, institution_id, actor)


# ── 과정 (기관 하위 마스터) ─────────────────────────────────────────────────────


@course_router.get("/categories", response_model=list[str])
async def list_course_categories(
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    """분류 드롭다운용 — distinct category 값."""
    return await institution_service.list_categories(db, search=search)


@course_router.get("", response_model=PagedResponse[CourseResponse])
async def list_courses(
    institution_id: uuid.UUID | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    category: str | None = None,
    is_external: bool | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    """과정명·과정코드·회차명·기관명 검색 + 분류·외부 필터."""
    courses, total = await institution_service.list_courses(
        db,
        institution_id=institution_id,
        is_active=is_active,
        search=search,
        category=category,
        is_external=is_external,
        page=page,
        limit=limit,
    )
    return PagedResponse(
        items=[CourseResponse.from_orm(c) for c in courses],
        total=total,
        page=page,
        limit=limit,
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


@course_router.delete("/{course_id}", status_code=204)
async def delete_course(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    """소프트딜리트 — 이력은 과정명 스냅샷으로 표시된다."""
    await institution_service.delete_course(db, course_id, actor)


# ── 교육 일정 (과정 하위 — 개설 회차) ──────────────────────────────────────────


@session_router.get("", response_model=PagedResponse[SessionResponse])
async def list_sessions(
    course_id: uuid.UUID | None = None,
    search: str | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    """일정 목록 — 기간(from~to 교육 기간 겹침)·상태 필터."""
    sessions, total, counts = await course_session_service.list_sessions(
        db,
        course_id=course_id,
        search=search,
        status=status,
        date_from=date_from,
        date_to=date_to,
        page=page,
        limit=limit,
    )
    return PagedResponse(
        items=[SessionResponse.from_orm(s, counts.get(s.id, 0)) for s in sessions],
        total=total,
        page=page,
        limit=limit,
    )


@session_router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    session = await course_session_service.get_session(db, session_id)
    counts = await institution_service.count_session_records(db, [session.id])
    return SessionResponse.from_orm(session, counts.get(session.id, 0))


@session_router.post("", response_model=SessionResponse, status_code=201)
async def create_session(
    body: SessionCreate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    session = await course_session_service.create_session(db, body, actor)
    return SessionResponse.from_orm(session)


@session_router.patch("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: uuid.UUID,
    body: SessionUpdate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    session = await course_session_service.update_session(db, session_id, body, actor)
    return SessionResponse.from_orm(session)


@session_router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    """일정 삭제 — 연결된 이력은 보존되고 연결(session_id)만 끊긴다."""
    await course_session_service.delete_session(db, session_id, actor)


# ── 회차명 마스터 ──────────────────────────────────────────────────────────────


@session_name_router.get("", response_model=PagedResponse[SessionNameResponse])
async def list_session_names(
    search: str | None = None,
    is_active: bool | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    names, total = await session_name_service.list_session_names(
        db, search=search, is_active=is_active, page=page, limit=limit
    )
    return PagedResponse(
        items=[SessionNameResponse.model_validate(n) for n in names],
        total=total,
        page=page,
        limit=limit,
    )


@session_name_router.post("", response_model=SessionNameResponse, status_code=201)
async def create_session_name(
    body: SessionNameCreate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    name = await session_name_service.create_session_name(db, body, actor)
    return SessionNameResponse.model_validate(name)


@session_name_router.patch("/{session_name_id}", response_model=SessionNameResponse)
async def update_session_name(
    session_name_id: uuid.UUID,
    body: SessionNameUpdate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    name = await session_name_service.update_session_name(db, session_name_id, body, actor)
    return SessionNameResponse.model_validate(name)


@session_name_router.delete("/{session_name_id}", status_code=204)
async def delete_session_name(
    session_name_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    """회차명 삭제 — 참조 중인 과정의 session_name_id 는 NULL 이 된다."""
    await session_name_service.delete_session_name(db, session_name_id, actor)
