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
    TraineeBulkGradeCreate,
    TraineeBulkResult,
    TraineeBulkUpdate,
    TraineeCreate,
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


@router.post("", response_model=TraineeResponse, status_code=201)
async def create_trainee(
    body: TraineeCreate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    """어드민 수기 등록 — 본인인증 없이 신원 확인 완료 상태(approved)로 만든다."""
    return TraineeResponse.from_orm(await trainee_service.create_trainee(db, body, actor))


@router.get("/duplicates", response_model=list[TraineeResponse])
async def list_cert_no_duplicates(
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    """감리원증번호가 중복인 교육생 목록 — 클라이언트가 직접 수정·삭제하는 데이터."""
    trainees = await trainee_service.list_cert_no_duplicates(db)
    return [TraineeResponse.from_orm(t) for t in trainees]


# /bulk* 정적 경로 — /{trainee_id} 보다 먼저 선언해야 한다


@router.post("/bulk-grade", response_model=TraineeBulkResult, status_code=200)
async def bulk_update_grade(
    body: TraineeBulkGradeCreate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    """선택 교육생 회원등급 일괄 변경 — 등급이력은 사유 None 으로 건당 기록."""
    updated, skipped = await trainee_service.update_trainees_grade_bulk(db, body, actor)
    return TraineeBulkResult(updated=updated, skipped=skipped)


@router.post("/bulk-update", response_model=TraineeBulkResult, status_code=200)
async def bulk_update_trainees(
    body: TraineeBulkUpdate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    """선택 교육생 기본정보 일괄 수정 — 보낸 필드만 건별 적용, 없는 id 는 건너뜀."""
    updated, skipped = await trainee_service.update_trainees_bulk(db, body, actor)
    return TraineeBulkResult(updated=updated, skipped=skipped)


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


@router.delete("/{trainee_id}", status_code=204)
async def delete_trainee(
    trainee_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    """소프트딜리트 — 이력·확인서·결제는 보존되고 목록·회원 서비스에서만 숨겨진다."""
    await trainee_service.delete_trainee(db, trainee_id, actor)


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


@grade_router.delete("/{grade_id}", status_code=204)
async def delete_grade(
    grade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    """소프트딜리트 — 배정된 활성 교육생이 있으면 409."""
    await trainee_service.delete_grade(db, grade_id, actor)
