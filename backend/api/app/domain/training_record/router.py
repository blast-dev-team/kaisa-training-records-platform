import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.core.response import PagedResponse
from app.domain.auth.model import AdminUser
from app.domain.training_record.schema import (
    ExternalHoursSummary,
    TraineeMatchPreviewResult,
    TrainingRecordBulkCreate,
    TrainingRecordBulkDelete,
    TrainingRecordBulkResult,
    TrainingRecordBulkUpdate,
    TrainingRecordCreate,
    TrainingRecordImportConfirmRequest,
    TrainingRecordImportPreviewResult,
    TrainingRecordImportResult,
    TrainingRecordResponse,
    TrainingRecordUpdate,
)
from app.domain.training_record.service import external_hours, training_record_service

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
    sort: str = Query(
        "period",
        pattern="^(period|registration)$",
        description="period=수강기간순(기본) · registration=등록순(2026-09 이후 실등록분만)",
    ),
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
        sort=sort,
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
    created, skipped, cap_excluded = await training_record_service.create_records_bulk(
        db, body, actor
    )
    return TrainingRecordBulkResult(
        created=created, skipped=skipped, external_cap_excluded=cap_excluded
    )


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




@router.post("/import-preview", response_model=TrainingRecordImportPreviewResult)
async def preview_training_import(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    """교육내역 엑셀 파싱 + 감리원 매칭 — 확정 전 프리뷰용."""
    content = await file.read()
    return await training_record_service.import_preview(db, content)


@router.post("/import-confirm", response_model=TrainingRecordImportResult)
async def confirm_training_import(
    body: TrainingRecordImportConfirmRequest,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    """프리뷰에서 확정한 행을 외부 교육 이력으로 일괄 등록 — 중복은 건너뛴다."""
    created, skipped, failed = await training_record_service.import_confirm(
        db, body, actor
    )
    return TrainingRecordImportResult(
        created=created,
        skipped=skipped,
        failed=[{"row_number": n, "error": msg} for n, msg in failed],
    )


@router.get("/external-hours", response_model=ExternalHoursSummary)
async def get_external_hours(
    trainee_id: uuid.UUID,
    exclude_record_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    """감리원의 최근 3년 외부교육 합계·남은 한도. 수정 중인 이력은 exclude_record_id 로 뺀다."""
    current = (
        await external_hours.external_hours_by_trainee(
            db, [trainee_id], [exclude_record_id] if exclude_record_id else None
        )
    )[trainee_id]
    return ExternalHoursSummary(
        window_start=external_hours.window_start(),
        external_hours=float(current),
        max_hours=float(external_hours.max_hours()),
        remaining_hours=float(external_hours.remaining_hours(current)),
    )


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
