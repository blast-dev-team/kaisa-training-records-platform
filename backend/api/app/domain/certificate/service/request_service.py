"""확인서 발급 신청 — 서버 전량 재판별 (소유·수료·등급·가격)."""

import secrets
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.certificate.model import Certificate, CertificateRequest
from app.domain.certificate.repository import pricing_repository
from app.domain.certificate.schema import CertificateRequestCreate
from app.domain.certificate.service import issuance_service
from app.domain.certificate.service.pricing import select_pricing_rule
from app.domain.payment.model import PaymentAttempt, PaymentOrder
from app.domain.trainee.model import Trainee
from app.domain.training_record.model import TrainingRecord


def _request_no() -> str:
    return f"CREQ-{now_kst().strftime('%Y%m%d')}-{secrets.token_hex(4)}"


def _order_no() -> str:
    """PortOne paymentId 로 그대로 쓰는 주문번호."""
    return f"ORD-{now_kst().strftime('%Y%m%d')}-{secrets.token_hex(6)}"


async def _find_active_certificate(
    db: AsyncSession, training_record_id: uuid.UUID
) -> Certificate | None:
    result = await db.execute(
        select(Certificate)
        .where(
            Certificate.training_record_id == training_record_id,
            Certificate.status == "issued",
        )
        .order_by(Certificate.issued_at.desc())
    )
    return result.scalars().first()


async def create_request(
    db: AsyncSession, trainee: Trainee, data: CertificateRequestCreate
) -> CertificateRequest:
    """게이트 통과 → request + (유료면) payment_order 생성. 0원이면 즉시 발급.

    반환은 request — response 조립에 필요한 order/certificate 는 relationship 으로 접근.
    """
    # 1. 소유·존재 — 타인 이력은 404
    record = (
        await db.execute(
            select(TrainingRecord).where(
                TrainingRecord.id == data.training_record_id,
                TrainingRecord.trainee_id == trainee.id,
                TrainingRecord.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if record is None:
        raise api_error("NOT_FOUND", message="교육이력을 찾을 수 없어요")

    # 2. 수료 완료
    if record.completion_status != "completed":
        raise api_error(
            "VALIDATION_ERROR", message="수료 완료된 이력만 발급 신청할 수 있어요"
        )

    # 3. 발급 유형
    if data.issue_type not in ("original", "reissue"):
        raise api_error(
            "VALIDATION_ERROR", message="발급 유형은 original 또는 reissue 이에요"
        )

    # 4. 등급 판별 완료
    if trainee.review_status != "approved" or trainee.membership_grade_id is None:
        raise api_error(
            "GRADE_NOT_DETERMINED", message="회원등급 판별이 완료되지 않았어요"
        )

    # 5. 기존 발급 여부 — original 이면 유효 확인서 있으면 차단, reissue 면 previous 로 지정
    active_cert = await _find_active_certificate(db, record.id)
    previous_certificate_id = None
    if data.issue_type == "original":
        if active_cert is not None:
            raise api_error(
                "CERTIFICATE_ALREADY_ISSUED",
                status_code=409,
                message="이미 발급된 확인서가 있어요. 재발급으로 신청해 주세요",
            )
    elif active_cert is not None:
        previous_certificate_id = active_cert.id

    # 6. 가격 스냅샷
    now = now_kst()
    rules = await pricing_repository.find_rules(
        db, trainee.membership_grade_id, data.issue_type
    )
    rule = select_pricing_rule(rules, trainee.membership_grade_id, data.issue_type, now)
    if rule is None:
        raise api_error("PRICING_RULE_NOT_FOUND", message="적용할 가격 규칙이 없어요")

    request = CertificateRequest(
        request_no=_request_no(),
        trainee_id=trainee.id,
        training_record_id=record.id,
        previous_certificate_id=previous_certificate_id,
        requested_by=trainee.user_id,
        issue_type=data.issue_type,
        membership_grade_id=trainee.membership_grade_id,
        pricing_rule_id=rule.id,
        amount_krw=rule.price_krw,
        currency=rule.currency,
        status="pending",
        requested_at=now,
    )
    db.add(request)
    await db.flush()

    # 7. 0원 → 결제 없이 즉시 발급
    if rule.price_krw == 0:
        request.status = "paid"
        request.paid_at = now
        await issuance_service.issue_certificate(db, request)
        await db.commit()
        await db.refresh(request)
        return request

    # 8. 유료 → 주문·시도 생성 (PortOne paymentId = order_no)
    order = PaymentOrder(
        order_no=_order_no(),
        certificate_request_id=request.id,
        trainee_id=trainee.id,
        amount_krw=rule.price_krw,
        currency=rule.currency,
        status="ready",
    )
    db.add(order)
    await db.flush()
    db.add(
        PaymentAttempt(
            payment_order_id=order.id,
            attempt_no=1,
            provider="portone",
            merchant_payment_id=order.order_no,
            status="ready",
            requested_amount_krw=rule.price_krw,
            requested_at=now,
        )
    )
    request.status = "payment_pending"
    await db.commit()
    await db.refresh(request)
    return request
