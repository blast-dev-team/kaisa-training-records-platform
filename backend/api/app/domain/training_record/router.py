import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.core.response import PagedResponse
from app.domain.auth.model import AdminUser
from app.domain.training_record.schema import (
    TrainingRecordBulkCreate,
    TrainingRecordBulkResult,
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
    records, total = await training_record_service.list_records(
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
