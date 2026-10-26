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
from app.domain.certificate.model import CertificateRequest
from app.domain.certificate.schema import (
    CertificateBatchRequestCreate,
    CertificateRequestCreate,
)
from app.domain.certificate.service import issuance_service
from app.domain.payment.model import PaymentAttempt, PaymentOrder
from app.domain.payment.service import payment_service
from app.domain.trainee.model import Trainee
from app.domain.trainee.service import trainee_service
from app.domain.training_record.model import TrainingRecord


async def _expire_then_reload(db: AsyncSession, trainee: Trainee) -> None:
    """단가 산정 전 자동 전환 — 기간 지난 연간 회원은 일반 단가가 적용돼야 한다."""
    if await trainee_service.expire_due_memberships(db):
        await db.refresh(trainee)


async def _resolve_open_orders(
    db: AsyncSession, trainee: Trainee, record_ids: list[uuid.UUID]
) -> None:
    """새 결제 신청 직전 — 같은 이력에 걸린 결제 대기 주문을 PortOne 에 확인한다.

    결제창에서 카드 결제까지 끝났는데 confirm 이 실패(브라우저 종료·네트워크·모바일
    리디렉션)한 주문이 있으면, 사용자는 결제가 안 된 줄 알고 다시 결제한다(이중 결제).
    - 이미 결제됐으면: 그 주문을 확정·발급하고 새 주문은 만들지 않는다(409 안내).
    - 결제 안 됐으면(창 미오픈·닫음): 이전 주문을 닫고 새 주문을 만든다.
    - PG 에서 결제 진행 중(앱카드·ISP 인증 등)이면: 닫지 않고 새 주문을 막는다.
    - PortOne 을 확인할 수 없으면: 이중 결제 위험이 있으므로 새 주문을 막는다.
    """
    open_order_ids = set(
        (
            await db.execute(
                select(CertificateRequest.payment_order_id).where(
                    CertificateRequest.trainee_id == trainee.id,
                    CertificateRequest.training_record_id.in_(record_ids),
                    CertificateRequest.status == "payment_pending",
                    CertificateRequest.payment_order_id.is_not(None),
                )
            )
        ).scalars()
    )
    outcomes = set()
    for order_id in open_order_ids:
        order = await db.get(PaymentOrder, order_id)
        if order is None:
            continue
        outcomes.add(
            await payment_service.reconcile_order(db, order, close_unpaid=True)
        )
    if "in_progress" in outcomes:
        raise api_error(
            "PAYMENT_IN_PROGRESS",
            message="이전 결제가 아직 진행 중이에요. 결제를 마쳤다면 잠시 후 발급·결제 내역을 확인해 주세요",
        )
    if "issued" in outcomes:
        raise api_error(
            "PAYMENT_ALREADY_COMPLETED",
            message="이전에 결제한 주문이 확인돼 확인서를 발급했어요. 발급·결제 내역에서 확인해 주세요",
        )


def _request_no() -> str:
    return f"CREQ-{now_kst().strftime('%Y%m%d')}-{secrets.token_hex(4)}"


def _order_no() -> str:
    """PortOne paymentId 로 그대로 쓰는 주문번호."""
    return f"ORD-{now_kst().strftime('%Y%m%d')}-{secrets.token_hex(6)}"


async def _validate_item(
    db: AsyncSession, trainee: Trainee, training_record_id: uuid.UUID
) -> TrainingRecord:
    """건별 게이트 — 검증을 통과한 이력 반환. 위반 시 raise.

    재발급 개념이 없다 — 이미 발급된 이력도 새 문서로 결제 발급할 수 있다.
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

    return record


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
    data: CertificateRequestCreate,
    amount_krw: int,
    now,
) -> CertificateRequest:
    """신청 스냅샷 생성 — 문서 발급은 전부 original이다(재발급 폐지)."""
    return CertificateRequest(
        request_no=_request_no(),
        trainee_id=trainee.id,
        training_record_id=record.id,
        requested_by=trainee.user_id,
        issue_type="original",
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

    record = await _validate_item(db, trainee, data.training_record_id)
    await _resolve_open_orders(db, trainee, [record.id])

    # 가격 스냅샷 — 항상 등급 단가 (무료 재발급 폐지)
    now = now_kst()
    amount_krw = _grade_price_krw(trainee)

    request = _build_request(trainee, record, data, amount_krw, now)
    db.add(request)
    await db.flush()

    # 0원 → 결제 없이 즉시 발급
    if amount_krw == 0:
        request.status = "paid"
        request.paid_at = now
        # 문서번호는 발급 이벤트당 1회 채번 — 단건 발급도 묶음 1건이라 번호 1개
        doc_no = await issuance_service.allocate_doc_no(db)
        certificate = await issuance_service.issue_certificate(
            db, request, doc_no=doc_no
        )
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
    전건 발급한다. 유료 합계가 0원이면(0원 등급) 즉시 발급.
    """
    await _expire_then_reload(db, trainee)
    _require_determined_grade(trainee)

    record_ids = [item.training_record_id for item in data.items]
    if len(set(record_ids)) != len(record_ids):
        raise api_error("VALIDATION_ERROR", message="중복된 교육이력이 있어요")
    await _resolve_open_orders(db, trainee, record_ids)

    # 전 건 검증·가격 확정을 먼저 끝낸 뒤 쓴다 — 절반만 반영되지 않게
    now = now_kst()
    amount_krw = _grade_price_krw(trainee)
    validated = []
    for item in data.items:
        record = await _validate_item(db, trainee, item.training_record_id)
        validated.append((record, item, amount_krw))

    requests = [
        _build_request(trainee, record, item, amount_krw, now)
        for record, item, amount_krw in validated
    ]
    db.add_all(requests)
    await db.flush()

    # 단 건·일괄 건 동일 요금 — 유료 건 중 최고 단가 1회만 청구
    paid_amounts = [amount for _, _, amount in validated if amount > 0]
    total_krw = max(paid_amounts) if paid_amounts else 0
    if total_krw == 0:
        # 한 이벤트에 발급된 N건 = 묶음 확인서 1건 — 문서번호도 1개
        doc_no = await issuance_service.allocate_doc_no(db)
        certificates = []
        for request in requests:
            request.status = "paid"
            request.paid_at = now
            certificates.append(
                await issuance_service.issue_certificate(
                    db, request, doc_no=doc_no
                )
            )
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
