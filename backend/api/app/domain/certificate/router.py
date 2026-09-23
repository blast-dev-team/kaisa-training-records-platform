import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_trainee, require_admin
from app.core.response import PagedResponse
from app.domain.auth.model import AdminUser
from app.domain.certificate.schema import (
    CertificateBatchRequestCreate,
    CertificateIssueGroupResult,
    CertificateIssueRequest,
    CertificateIssueResult,
    CertificateRequestCreate,
    CertificateRequestResponse,
    CertificateResponse,
    CertificateRevokeRequest,
    CompletionCertificateIssueRequest,
    CompletionCertificateResponse,
    PublicVerificationRequest,
    PublicVerificationResponse,
)
from app.domain.certificate.service import (
    certificate_admin_service,
    completion_certificate_service,
    public_verification_service,
    request_service,
)
from app.domain.trainee.model import Trainee

# 회원 — 발급 신청
router = APIRouter(prefix="/certificate-requests", tags=["certificates"])

# 어드민 — 확인서 관리
admin_router = APIRouter(prefix="/certificates", tags=["certificates"])

# 어드민 — 수료증 발급 (내부 기관 수료내역 전용)
completion_router = APIRouter(prefix="/completion-certificates", tags=["certificates"])

# 공개 — 진위확인
public_router = APIRouter(prefix="/public", tags=["public"])


@router.post("", response_model=CertificateRequestResponse, status_code=201)
async def create_certificate_request(
    body: CertificateRequestCreate,
    trainee: Trainee = Depends(get_current_trainee),
    db: AsyncSession = Depends(get_db),
):
    request = await request_service.create_request(db, trainee, body)
    return CertificateRequestResponse.from_orm(request)


@router.post(
    "/batch", response_model=list[CertificateRequestResponse], status_code=201
)
async def create_certificate_requests_batch(
    body: CertificateBatchRequestCreate,
    trainee: Trainee = Depends(get_current_trainee),
    db: AsyncSession = Depends(get_db),
):
    """다건 발급 — 유효 신청들을 하나의 결제 주문으로 묶어 반환한다."""
    requests = await request_service.create_requests_batch(db, trainee, body)
    return [CertificateRequestResponse.from_orm(r) for r in requests]


@admin_router.get("", response_model=PagedResponse[CertificateResponse])
async def list_certificates(
    trainee_id: uuid.UUID | None = None,
    status: str | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    certificates, total = await certificate_admin_service.list_certificates(
        db,
        trainee_id=trainee_id,
        status=status,
        search=search,
        date_from=date_from,
        date_to=date_to,
        page=page,
        limit=limit,
    )
    return PagedResponse(
        items=[CertificateResponse.from_orm(c) for c in certificates],
        total=total,
        page=page,
        limit=limit,
    )


@admin_router.post("/issue", response_model=CertificateIssueResult)
async def issue_certificates(
    body: CertificateIssueRequest,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_admin),
):
    """어드민 발급 저장 — 결제 없이 감리원별 묶음(문서 1건)씩 발급을 확정한다.

    문서번호는 그룹(발급 이벤트)당 1회 채번된다. 이미 유효 발급분이 있는
    내역은 skipped 로 돌아온다 — 재발급은 WEB 경로로만 한다.
    """
    groups = [(g.trainee_id, g.record_ids) for g in body.groups]
    results = await certificate_admin_service.issue_certificates(db, groups, admin)
    return CertificateIssueResult(
        groups=[CertificateIssueGroupResult.model_validate(r) for r in results]
    )


@admin_router.post("/{certificate_id}/revoke", response_model=CertificateResponse)
async def revoke_certificate(
    certificate_id: uuid.UUID,
    body: CertificateRevokeRequest,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_admin),
):
    certificate = await certificate_admin_service.revoke_certificate(
        db, certificate_id, body.reason, admin
    )
    return CertificateResponse.from_orm(certificate)


@public_router.post(
    "/certificate-verifications", response_model=PublicVerificationResponse
)
async def verify_certificate(
    body: PublicVerificationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    return await public_verification_service.verify_certificate(db, request, body)


@completion_router.post(
    "/issue",
    response_model=list[CompletionCertificateResponse],
    status_code=201,
)
async def issue_completion_certificates(
    body: CompletionCertificateIssueRequest,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_admin),
):
    """수료증 발급 — 내부 기관 수료내역 1건당 1장. 기발급 건은 기존 수료증 반환."""
    certificates = await completion_certificate_service.issue_completion_certificates(
        db, body.training_record_ids, admin
    )
    return [CompletionCertificateResponse.from_orm(c) for c in certificates]
