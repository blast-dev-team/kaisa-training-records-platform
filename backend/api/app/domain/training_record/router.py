import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.core.response import PagedResponse
from app.domain.auth.model import AdminUser
from app.domain.training_record.schema import (
    TrainingRecordCreate,
    TrainingRecordResponse,
    TrainingRecordUpdate,
)
from app.domain.training_record.service import training_record_service

router = APIRouter(prefix="/training-records", tags=["training-records"])


@router.get("", response_model=PagedResponse[TrainingRecordResponse])
async def list_records(
    trainee_id: uuid.UUID | None = None,
    source: str | None = None,
    completion_status: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    records, total = await training_record_service.list_records(
        db,
        trainee_id=trainee_id,
        source=source,
        completion_status=completion_status,
        page=page,
        limit=limit,
    )
    return PagedResponse(
        items=[TrainingRecordResponse.model_validate(r) for r in records],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/{record_id}", response_model=TrainingRecordResponse)
async def get_record(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    return TrainingRecordResponse.model_validate(
        await training_record_service.get_record(db, record_id)
    )


@router.post("", response_model=TrainingRecordResponse, status_code=201)
async def create_record(
    body: TrainingRecordCreate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    return TrainingRecordResponse.model_validate(
        await training_record_service.create_record(db, body, actor)
    )


@router.patch("/{record_id}", response_model=TrainingRecordResponse)
async def update_record(
    record_id: uuid.UUID,
    body: TrainingRecordUpdate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    return TrainingRecordResponse.model_validate(
        await training_record_service.update_record(db, record_id, body, actor)
    )


@router.delete("/{record_id}", status_code=204)
async def delete_record(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    await training_record_service.delete_record(db, record_id, actor)
