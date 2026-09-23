import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_trainee, get_current_user
from app.core.error_codes import api_error
from app.core.response import PagedResponse
from app.domain.certificate.schema import (
    CompletionCertificateIssueRequest,
    CompletionCertificateResponse,
)
from app.domain.certificate.service import completion_certificate_service
from app.domain.me.schema import (
    CertificatePriceResponse,
    DownloadUrlResponse,
    MeProfileResponse,
    MeSessionResponse,
    MyCertificateRequestResponse,
    MyCertificateResponse,
    MyPaymentHistoryItem,
    MyPaymentOrderResponse,
)
from app.domain.me.service import me_service
from app.domain.trainee.model import Trainee
from app.domain.training_record.schema import TrainingRecordResponse
from app.domain.user.model import User

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/session", response_model=MeSessionResponse)
async def get_my_session(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """본인인증 세션 조회 — 새로고침 시 FE 인증 상태 복구용. 무효 세션 401."""
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    return await me_service.get_session(db, token)


@router.post("/session/extend", response_model=MeSessionResponse)
async def extend_my_session(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """본인인증 세션 연장 — 유효 세션 만료 시각을 리셋해 반환. 무효 세션 401."""
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    return await me_service.extend_session(db, token)


@router.get("/profile", response_model=MeProfileResponse)
async def get_my_profile(
    db: AsyncSession = Depends(get_db),
    trainee: Trainee = Depends(get_current_trainee),
):
    return await me_service.get_profile(db, trainee)


@router.get("/training-records", response_model=PagedResponse[TrainingRecordResponse])
async def get_my_training_records(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """본인 이력 + 공용 데모 이력. 교육생 미연결 신규 회원도 데모 이력을 본다."""
    records, total, hours_sum = await me_service.list_member_records(
        db,
        user,
        search=search,
        ended_from_raw=from_,
        ended_to_raw=to,
        page=page,
        limit=limit,
    )
    return PagedResponse(
        items=records,
        total=total,
        page=page,
        limit=limit,
        total_hours_sum=float(hours_sum),
    )


@router.get(
    "/training-records/{record_id}/download", response_model=DownloadUrlResponse
)
async def download_my_training_record(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """교육이력 파일 다운로드 — 데모 이력은 S3 데모 PDF 로 통일."""
    url = await me_service.get_demo_download_url(db, user, record_id)
    return DownloadUrlResponse(url=url, file_name="교육이력확인서-데모.pdf")


@router.get("/training-records/{record_id}", response_model=TrainingRecordResponse)
async def get_my_training_record(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """본인 이력 또는 공용 데모 이력 상세 (발급 상태 포함). 교육생 미연결 신규 회원도 데모는 본다."""
    return await me_service.get_member_record_response(db, user, record_id)


@router.post(
    "/completion-certificates",
    response_model=list[CompletionCertificateResponse],
    status_code=201,
)
async def issue_my_completion_certificates(
    body: CompletionCertificateIssueRequest,
    db: AsyncSession = Depends(get_db),
    trainee: Trainee = Depends(get_current_trainee),
):
    """수료증 발급(웹) — 소유한 내부 기관 수료내역 1건당 1장. 무료·결제 없음.

    기발급 건은 기존 수료증을 그대로 반환한다(멱등). 데모 이력은 공용이라 제외.
    """
    certificates = await completion_certificate_service.issue_completion_certificates_for_trainee(
        db, body.training_record_ids, trainee
    )
    return [CompletionCertificateResponse.from_orm(c) for c in certificates]


@router.get(
    "/completion-certificates/preview",
    response_model=CompletionCertificateResponse,
)
async def preview_my_completion_certificate(
    training_record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """수료증 미리보기 — 슈퍼 계정 전용. 저장 없이 해당 이력 교육생 데이터로 조립."""
    if not me_service.is_super_user(user):
        raise api_error("FORBIDDEN", message="권한이 없어요")
    preview = await completion_certificate_service.build_preview_completion_certificate(
        db, training_record_id
    )
    return CompletionCertificateResponse(**preview)


@router.get("/certificates", response_model=list[MyCertificateResponse])
async def get_my_certificates(
    db: AsyncSession = Depends(get_db),
    trainee: Trainee = Depends(get_current_trainee),
):
    return [
        MyCertificateResponse.from_orm_with_issue_type(c, issue_type)
        for c, issue_type in await me_service.list_my_certificates(db, trainee)
    ]


@router.post("/certificates/{certificate_id}/downloaded")
async def mark_certificate_downloaded(
    certificate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    trainee: Trainee = Depends(get_current_trainee),
):
    """WEB에서 확인서 PDF 저장 신고 — 최초 시각·횟수 기록 (어드민 조회용)."""
    await me_service.mark_certificate_downloaded(db, trainee, certificate_id)
    return {"ok": True}


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


@router.get(
    "/payment-history",
    response_model=PagedResponse[MyPaymentHistoryItem],
)
async def get_my_payment_history(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    trainee: Trainee = Depends(get_current_trainee),
):
    """발급·결제 내역 — 결제완료·환불 주문만 주문 단위로 반환."""
    items, total = await me_service.list_payment_history(
        db,
        trainee,
        paid_from_raw=from_,
        paid_to_raw=to,
        status=status,
        page=page,
        limit=limit,
    )
    return PagedResponse(items=items, total=total, page=page, limit=limit)


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
