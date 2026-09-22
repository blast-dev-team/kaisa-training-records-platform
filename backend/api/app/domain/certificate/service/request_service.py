"""확인서 발급 신청 — 서버 전량 재판별 (소유·수료·등급·가격).

다건 발급(batch)은 유효한 신청들을 하나의 결제 주문으로 묶는다.
"""

import secrets
import uuid
from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.error_codes import api_error
from app.core.kst import now_kst, today_kst
from app.domain.certificate.model import Certificate, CertificateRequest
from app.domain.certificate.schema import (
    CertificateBatchRequestCreate,
    CertificateRequestCreate,
)
from app.domain.certificate.service import issuance_service
from app.domain.payment.model import PaymentAttempt, PaymentOrder
from app.domain.trainee.model import Trainee
from app.domain.trainee.service import trainee_service
from app.domain.training_record.model import TrainingRecord


async def _expire_then_reload(db: AsyncSession, trainee: Trainee) -> None:
    """단가 산정 전 자동 전환 — 기간 지난 연간 회원은 일반 단가가 적용돼야 한다."""
    if await trainee_service.expire_due_memberships(db):
        await db.refresh(trainee)


def _request_no() -> str:
    return f"CREQ-{now_kst().strftime('%Y%m%d')}-{secrets.token_hex(4)}"


def _order_no() -> str:
    """PortOne paymentId 로 그대로 쓰는 주문번호."""
    return f"ORD-{now_kst().strftime('%Y%m%d')}-{secrets.token_hex(6)}"


async def _find_active_certificate(
    db: AsyncSession, trainee_id: uuid.UUID, training_record_id: uuid.UUID
) -> Certificate | None:
    """회원별 유효 확인서 — 데모 이력은 여러 회원이 공유하므로 trainee 스코프 필수."""
    result = await db.execute(
        select(Certificate)
        .where(
            Certificate.trainee_id == trainee_id,
            Certificate.training_record_id == training_record_id,
            Certificate.status == "issued",
        )
        .order_by(Certificate.issued_at.desc())
    )
    return result.scalars().first()


async def _validate_item(
    db: AsyncSession,
    trainee: Trainee,
    training_record_id: uuid.UUID,
    issue_type: str,
) -> tuple[TrainingRecord, Certificate | None]:
    """건별 게이트 — (이력, 유효 확인서) 반환. 위반 시 raise.

    유효 확인서는 재발급 previous 지정과 무료 재발급(7일 내) 판정에 쓰인다.
    """
    # 소유·존재 — 타인 이력은 404. 공용 데모 이력(is_demo)은 모든 회원 발급 대상
    record = (
        await db.execute(
            select(TrainingRecord).where(
                TrainingRecord.id == training_record_id,
                TrainingRecord.deleted_at.is_(None),
                or_(
                    TrainingRecord.trainee_id == trainee.id,
                    TrainingRecord.is_demo.is_(True),
                ),
            )
        )
    ).scalar_one_or_none()
    if record is None:
        raise api_error("NOT_FOUND", message="교육이력을 찾을 수 없어요")

    # 수강 시작일 기준 3년 이내만 발급 가능 — 초과 이력은 발급 신청 자체를 차단
    if (
        record.started_at is not None
        and record.started_at
        < today_kst() - timedelta(days=settings.CERTIFICATE_ISSUE_WINDOW_DAYS)
    ):
        raise api_error(
            "VALIDATION_ERROR",
            message="최근 3년 이내 교육만 확인서를 발급할 수 있어요",
        )

    # 수료 완료
    if record.completion_status != "completed":
        raise api_error(
            "VALIDATION_ERROR", message="수료 완료된 이력만 발급 신청할 수 있어요"
        )

    # 발급 유형
    if issue_type not in ("original", "reissue"):
        raise api_error(
            "VALIDATION_ERROR", message="발급 유형은 original 또는 reissue 이에요"
        )

    # 기존 발급 여부 — original 이면 유효 확인서 있으면 차단, reissue 면 previous 로 지정
    active_cert = await _find_active_certificate(db, trainee.id, record.id)
    if issue_type == "original" and active_cert is not None:
        raise api_error(
            "CERTIFICATE_ALREADY_ISSUED",
            status_code=409,
            message="이미 발급된 확인서가 있어요. 재발급으로 신청해 주세요",
        )

    return record, active_cert


def _reissue_price_krw(price_krw: int, active_cert: Certificate | None, now) -> int:
    """재발급 가격 — 직전 발급일이 무료 기간(7일) 이내면 0원, 아니면 등급 단가."""
    if active_cert is None or active_cert.issued_at is None:
        return price_krw
    if now - active_cert.issued_at <= timedelta(
        days=settings.CERTIFICATE_REISSUE_FREE_DAYS
    ):
        return 0
    return price_krw


def _require_determined_grade(trainee: Trainee) -> uuid.UUID:
    if trainee.review_status != "approved" or trainee.membership_grade_id is None:
        raise api_error(
            "GRADE_NOT_DETERMINED", message="회원등급 판별이 완료되지 않았어요"
        )
    return trainee.membership_grade_id


def _grade_price_krw(trainee: Trainee) -> int:
    """발급 단가 — 등급이 가진 가격. 등급 price_krw 가 설정 안 된 경우도 0원으로 본다."""
    return trainee.grade.price_krw if trainee.grade else 0


def _build_request(
    trainee: Trainee,
    record: TrainingRecord,
    active_cert: Certificate | None,
    data: CertificateRequestCreate,
    amount_krw: int,
    now,
) -> CertificateRequest:
    """신청 스냅샷 생성 — 재발급이면 previous 지정, 무료 재발급이면 0원."""
    previous_certificate_id = (
        active_cert.id if data.issue_type == "reissue" and active_cert else None
    )
    return CertificateRequest(
        request_no=_request_no(),
        trainee_id=trainee.id,
        training_record_id=record.id,
        previous_certificate_id=previous_certificate_id,
        requested_by=trainee.user_id,
        issue_type=data.issue_type,
        membership_grade_id=trainee.membership_grade_id,
        amount_krw=amount_krw,
        currency="KRW",
        status="pending",
        requested_at=now,
    )


async def create_request(
    db: AsyncSession, trainee: Trainee, data: CertificateRequestCreate
) -> CertificateRequest:
    """게이트 통과 → request + (유료면) payment_order 생성. 0원이면 즉시 발급.

    반환은 request — response 조립에 필요한 order/certificate 는 relationship 으로 접근.
    """
    await _expire_then_reload(db, trainee)
    _require_determined_grade(trainee)

    record, active_cert = await _validate_item(
        db, trainee, data.training_record_id, data.issue_type
    )

    # 가격 스냅샷 — 등급 단가. 재발급은 직전 발급일이 7일 이내면 무료
    now = now_kst()
    price_krw = _grade_price_krw(trainee)
    amount_krw = (
        _reissue_price_krw(price_krw, active_cert, now)
        if data.issue_type == "reissue"
        else price_krw
    )

    request = _build_request(
        trainee, record, active_cert, data, amount_krw, now
    )
    db.add(request)
    await db.flush()

    # 0원 → 결제 없이 즉시 발급
    if amount_krw == 0:
        request.status = "paid"
        request.paid_at = now
        certificate = await issuance_service.issue_certificate(db, request)
        issuance_service.assign_bundle_no([certificate])
        await db.commit()
        await db.refresh(request)
        return request

    # 유료 → 주문·시도 생성 (PortOne paymentId = order_no)
    order = PaymentOrder(
        order_no=_order_no(),
        certificate_request_id=request.id,
        trainee_id=trainee.id,
        amount_krw=amount_krw,
        currency="KRW",
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
            requested_amount_krw=amount_krw,
            requested_at=now,
        )
    )
    request.payment_order_id = order.id
    request.status = "payment_pending"
    await db.commit()
    await db.refresh(request)
    return request


async def create_requests_batch(
    db: AsyncSession, trainee: Trainee, data: CertificateBatchRequestCreate
) -> list[CertificateRequest]:
    """다건 발급 — 전 건 게이트 통과 시 하나의 결제 주문으로 묶는다.

    한 건이라도 위반하면 전부 거절(원자성). 발급 비용은 단 건·일괄 건 동일이라
    유료 건이 하나라도 있으면 단가 1회만 청구하는 주문을 만들고 confirm 시
    전건 발급한다. 유료 합계가 0원이면(전 건 0원 가격·무료 재발급) 즉시 발급.
    """
    await _expire_then_reload(db, trainee)
    _require_determined_grade(trainee)

    record_ids = [item.training_record_id for item in data.items]
    if len(set(record_ids)) != len(record_ids):
        raise api_error("VALIDATION_ERROR", message="중복된 교육이력이 있어요")

    # 전 건 검증·가격 확정을 먼저 끝낸 뒤 쓴다 — 절반만 반영되지 않게
    now = now_kst()
    price_krw = _grade_price_krw(trainee)
    validated = []
    for item in data.items:
        record, active_cert = await _validate_item(
            db, trainee, item.training_record_id, item.issue_type
        )
        amount_krw = (
            _reissue_price_krw(price_krw, active_cert, now)
            if item.issue_type == "reissue"
            else price_krw
        )
        validated.append((record, active_cert, item, amount_krw))

    requests = [
        _build_request(trainee, record, active_cert, item, amount_krw, now)
        for record, active_cert, item, amount_krw in validated
    ]
    db.add_all(requests)
    await db.flush()

    # 단 건·일괄 건 동일 요금 — 유료 건 중 최고 단가 1회만 청구 (FE는 카테고리 혼합을 막음)
    paid_amounts = [amount for _, _, _, amount in validated if amount > 0]
    total_krw = max(paid_amounts) if paid_amounts else 0
    if total_krw == 0:
        certificates = []
        for request in requests:
            request.status = "paid"
            request.paid_at = now
            certificates.append(
                await issuance_service.issue_certificate(db, request)
            )
        # 한 이벤트에 발급된 N건 = 묶음 확인서 1건
        issuance_service.assign_bundle_no(certificates)
        await db.commit()
        for request in requests:
            await db.refresh(request)
        return requests

    order = PaymentOrder(
        order_no=_order_no(),
        trainee_id=trainee.id,
        amount_krw=total_krw,
        currency=requests[0].currency,
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
            requested_amount_krw=total_krw,
            requested_at=now,
        )
    )
    for request in requests:
        request.payment_order_id = order.id
        request.status = "payment_pending"
    await db.commit()
    for request in requests:
        await db.refresh(request)
    return requests
