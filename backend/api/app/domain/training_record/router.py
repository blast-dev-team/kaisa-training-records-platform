import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.core.response import PagedResponse
from app.domain.auth.model import AdminUser
from app.domain.training_record.schema import (
    TraineeMatchPreviewResult,
    TrainingRecordBulkCreate,
    TrainingRecordBulkDelete,
    TrainingRecordBulkResult,
    TrainingRecordBulkUpdate,
    TrainingRecordCreate,
    TrainingRecordResponse,
    TrainingRecordUpdate,
)
from app.domain.training_record.service import training_record_service

router = APIRouter(prefix="/training-records", tags=["training-records"])


@router.get("", response_model=PagedResponse[TrainingRecordResponse])
async def list_records(
    trainee_id: uuid.UUID | None = None,
    session_id: uuid.UUID | None = None,
    source: str | None = None,
    exclude_source: str | None = None,
    completion_status: str | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    records, total, hours_sum = await training_record_service.list_records(
        db,
        trainee_id=trainee_id,
        session_id=session_id,
        source=source,
        exclude_source=exclude_source,
        completion_status=completion_status,
        search=search,
        date_from=date_from,
        date_to=date_to,
        page=page,
        limit=limit,
    )
    return PagedResponse(
        items=[TrainingRecordResponse.from_orm(r) for r in records],
        total=total,
        page=page,
        limit=limit,
        total_hours_sum=float(hours_sum),
    )


@router.post("/bulk", response_model=TrainingRecordBulkResult, status_code=200)
async def create_records_bulk(
    body: TrainingRecordBulkCreate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    """일정에 교육생 일괄 연결 — 선택한 교육생 수만큼 이력 생성, 중복은 건너뜀."""
    created, skipped = await training_record_service.create_records_bulk(
        db, body, actor
    )
    return TrainingRecordBulkResult(created=created, skipped=skipped)


@router.patch("/bulk", status_code=200)
async def update_records_bulk(
    body: TrainingRecordBulkUpdate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    """선택 이력 일괄 수정 — 행별로 전달된 필드만 변경, 한 트랜잭션으로 커밋."""
    updated = await training_record_service.bulk_update_records(db, body, actor)
    return {"ok": True, "updated": updated}


@router.delete("/bulk", status_code=200)
async def delete_records_bulk(
    body: TrainingRecordBulkDelete,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    """선택 이력 일괄 삭제 — 소프트딜리트라 감사로그·발급 이력은 보존된다."""
    deleted = await training_record_service.bulk_delete_records(db, body, actor)
    return {"ok": True, "deleted": deleted}


# /match* 정적 경로 — /{record_id} 보다 먼저 선언해야 한다


@router.post("/match-preview", response_model=TraineeMatchPreviewResult)
async def preview_trainee_match(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    """엑셀 행을 교육생과 대조 — 매칭된 교육생 목록을 돌려준다(연결 전 자동 선택용)."""
    content = await file.read()
    return await training_record_service.match_preview(db, content)


@router.get("/{record_id}", response_model=TrainingRecordResponse)
async def get_record(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    return TrainingRecordResponse.from_orm(
        await training_record_service.get_record(db, record_id)
    )


@router.post("", response_model=TrainingRecordResponse, status_code=201)
async def create_record(
    body: TrainingRecordCreate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    return TrainingRecordResponse.from_orm(
        await training_record_service.create_record(db, body, actor)
    )


@router.patch("/{record_id}", response_model=TrainingRecordResponse)
async def update_record(
    record_id: uuid.UUID,
    body: TrainingRecordUpdate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    return TrainingRecordResponse.from_orm(
        await training_record_service.update_record(db, record_id, body, actor)
    )


@router.delete("/{record_id}", status_code=204)
async def delete_record(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    await training_record_service.delete_record(db, record_id, actor)
