import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.core.response import PagedResponse
from app.domain.auth.model import AdminUser
from app.domain.trainee.schema import (
    MembershipGradeCreate,
    MembershipGradeResponse,
    MembershipGradeUpdate,
    TraineeResponse,
    TraineeUpdate,
)
from app.domain.trainee.service import trainee_service

router = APIRouter(prefix="/trainees", tags=["trainees"])
grade_router = APIRouter(prefix="/membership-grades", tags=["membership-grades"])


@router.get("", response_model=PagedResponse[TraineeResponse])
async def list_trainees(
    search: str | None = None,
    review_status: str | None = None,
    grade_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    trainees, total = await trainee_service.list_trainees(
        db,
        search=search,
        review_status=review_status,
        grade_id=grade_id,
        page=page,
        limit=limit,
    )
    return PagedResponse(
        items=[TraineeResponse.from_orm(t) for t in trainees],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/{trainee_id}", response_model=TraineeResponse)
async def get_trainee(
    trainee_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    return TraineeResponse.from_orm(await trainee_service.get_trainee(db, trainee_id))


@router.patch("/{trainee_id}", response_model=TraineeResponse)
async def update_trainee(
    trainee_id: uuid.UUID,
    body: TraineeUpdate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    trainee = await trainee_service.update_trainee(db, trainee_id, body, actor)
    return TraineeResponse.from_orm(trainee)


# ── 등급 마스터 ────────────────────────────────────────────────────────────────


@grade_router.get("", response_model=list[MembershipGradeResponse])
async def list_grades(
    is_active: bool | None = None,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    return await trainee_service.list_grades(db, is_active=is_active)


@grade_router.post("", response_model=MembershipGradeResponse, status_code=201)
async def create_grade(
    body: MembershipGradeCreate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    return await trainee_service.create_grade(db, body, actor)


@grade_router.patch("/{grade_id}", response_model=MembershipGradeResponse)
async def update_grade(
    grade_id: uuid.UUID,
    body: MembershipGradeUpdate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    return await trainee_service.update_grade(db, grade_id, body, actor)
