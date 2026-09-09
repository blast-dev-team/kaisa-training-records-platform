import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_trainee, require_admin
from app.core.response import PagedResponse
from app.domain.auth.model import AdminUser
from app.domain.certificate.schema import (
    CertificateRequestCreate,
    CertificateRequestResponse,
    CertificateResponse,
    CertificateRevokeRequest,
    PricingRuleCreate,
    PricingRuleResponse,
    PricingRuleUpdate,
    PublicVerificationRequest,
    PublicVerificationResponse,
)
from app.domain.certificate.service import (
    certificate_admin_service,
    pricing_service,
    public_verification_service,
    request_service,
)
from app.domain.trainee.model import Trainee

# 회원 — 발급 신청
router = APIRouter(prefix="/certificate-requests", tags=["certificates"])

# 어드민 — 가격 규칙
pricing_router = APIRouter(prefix="/certificate-pricing-rules", tags=["certificates"])

# 어드민 — 확인서 관리
admin_router = APIRouter(prefix="/certificates", tags=["certificates"])

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


@pricing_router.get("", response_model=PagedResponse[PricingRuleResponse])
async def list_pricing_rules(
    membership_grade_id: uuid.UUID | None = None,
    issue_type: str | None = None,
    is_active: bool | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    rules, total = await pricing_service.list_rules(
        db,
        page=page,
        limit=limit,
        membership_grade_id=membership_grade_id,
        issue_type=issue_type,
        is_active=is_active,
    )
    return PagedResponse(
        items=[PricingRuleResponse.model_validate(r) for r in rules],
        total=total,
        page=page,
        limit=limit,
    )


@pricing_router.post("", response_model=PricingRuleResponse, status_code=201)
async def create_pricing_rule(
    body: PricingRuleCreate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_admin),
):
    rule = await pricing_service.create_rule(db, body, admin)
    return PricingRuleResponse.model_validate(rule)


@pricing_router.patch("/{rule_id}", response_model=PricingRuleResponse)
async def update_pricing_rule(
    rule_id: uuid.UUID,
    body: PricingRuleUpdate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_admin),
):
    rule = await pricing_service.update_rule(db, rule_id, body, admin)
    return PricingRuleResponse.model_validate(rule)


@admin_router.get("", response_model=PagedResponse[CertificateResponse])
async def list_certificates(
    trainee_id: uuid.UUID | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    certificates, total = await certificate_admin_service.list_certificates(
        db, trainee_id=trainee_id, status=status, page=page, limit=limit
    )
    return PagedResponse(
        items=[CertificateResponse.model_validate(c) for c in certificates],
        total=total,
        page=page,
        limit=limit,
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
    return CertificateResponse.model_validate(certificate)


@public_router.post(
    "/certificate-verifications", response_model=PublicVerificationResponse
)
async def verify_certificate(
    body: PublicVerificationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    return await public_verification_service.verify_certificate(db, request, body)
