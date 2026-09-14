import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_trainee
from app.domain.me.schema import (
    CertificatePriceResponse,
    MeProfileResponse,
    MyCertificateRequestResponse,
    MyCertificateResponse,
    MyPaymentOrderResponse,
)
from app.domain.me.service import me_service
from app.domain.trainee.model import Trainee
from app.domain.training_record.schema import TrainingRecordResponse

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/profile", response_model=MeProfileResponse)
async def get_my_profile(
    db: AsyncSession = Depends(get_db),
    trainee: Trainee = Depends(get_current_trainee),
):
    return await me_service.get_profile(db, trainee)


@router.get("/training-records", response_model=list[TrainingRecordResponse])
async def get_my_training_records(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    completion_status: str | None = None,
    db: AsyncSession = Depends(get_db),
    trainee: Trainee = Depends(get_current_trainee),
):
    records = await me_service.list_my_records(
        db,
        trainee,
        completion_status=completion_status,
        ended_from_raw=from_,
        ended_to_raw=to,
    )
    return [TrainingRecordResponse.model_validate(r) for r in records]


@router.get("/training-records/{record_id}", response_model=TrainingRecordResponse)
async def get_my_training_record(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    trainee: Trainee = Depends(get_current_trainee),
):
    return TrainingRecordResponse.model_validate(
        await me_service.get_my_record(db, trainee, record_id)
    )


@router.get("/certificates", response_model=list[MyCertificateResponse])
async def get_my_certificates(
    db: AsyncSession = Depends(get_db),
    trainee: Trainee = Depends(get_current_trainee),
):
    return [
        MyCertificateResponse.from_orm_with_issue_type(c, issue_type)
        for c, issue_type in await me_service.list_my_certificates(db, trainee)
    ]


@router.get("/certificate-requests", response_model=list[MyCertificateRequestResponse])
async def get_my_certificate_requests(
    db: AsyncSession = Depends(get_db),
    trainee: Trainee = Depends(get_current_trainee),
):
    return [
        MyCertificateRequestResponse.model_validate(r)
        for r in await me_service.list_my_requests(db, trainee)
    ]


@router.get("/payment-orders", response_model=list[MyPaymentOrderResponse])
async def get_my_payment_orders(
    db: AsyncSession = Depends(get_db),
    trainee: Trainee = Depends(get_current_trainee),
):
    return [
        MyPaymentOrderResponse.model_validate(o)
        for o in await me_service.list_my_orders(db, trainee)
    ]


@router.get("/certificate-price", response_model=CertificatePriceResponse)
async def get_my_certificate_price(
    training_record_id: uuid.UUID,
    issue_type: str,
    db: AsyncSession = Depends(get_db),
    trainee: Trainee = Depends(get_current_trainee),
):
    return await me_service.get_certificate_price(
        db, trainee, training_record_id, issue_type
    )
