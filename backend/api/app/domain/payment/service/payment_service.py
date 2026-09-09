"""결제 확인 — single-fetch 검증 후 발급까지 동일 트랜잭션."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.certificate.model import Certificate, CertificateRequest
from app.domain.certificate.schema import MyCertificateBrief
from app.domain.certificate.service import issuance_service
from app.domain.payment.model import PaymentOrder
from app.domain.payment.repository import payment_repository as repo
from app.domain.payment.schema import PaymentConfirmResponse
from app.domain.trainee.model import Trainee
from app.integrations import portone


async def _find_certificate(db: AsyncSession, order_id) -> Certificate | None:
    result = await db.execute(
        select(Certificate).where(Certificate.payment_order_id == order_id)
    )
    return result.scalars().first()


def _validate_payment(result: dict, order: PaymentOrder) -> None:
    """PortOne 결제 단일조회 결과 검증 — 상태·금액·통화·스토어."""
    if result.get("status") != "PAID":
        raise api_error("PAYMENT_NOT_PAID", message="결제가 완료되지 않았어요")
    amount = result.get("amount") or {}
    total = amount.get("total") or amount.get("paid") or amount.get("amount")
    if total != order.amount_krw or (amount.get("currency") or "KRW") != "KRW":
        raise api_error(
            "PAYMENT_AMOUNT_MISMATCH",
            status_code=409,
            message="결제 금액이 주문 금액과 일치하지 않아요",
        )
    if settings.PORTONE_STORE_ID and result.get("storeId") not in (
        None,
        settings.PORTONE_STORE_ID,
    ):
        raise api_error(
            "PAYMENT_STORE_MISMATCH",
            status_code=409,
            message="다른 스토어의 결제예요",
        )


async def confirm_order(
    db: AsyncSession, order: PaymentOrder
) -> PaymentConfirmResponse:
    """주문 결제 확정 — 웹훅·수동 confirm 공통 경로. single-fetch 후 발급."""
    certificate = await _find_certificate(db, order.id)
    if certificate is not None:  # 이미 발급까지 완료 — 멱등 반환
        return PaymentConfirmResponse(
            order_no=order.order_no,
            status=order.status,
            paid_at=order.paid_at,
            certificate=MyCertificateBrief.model_validate(certificate),
        )

    if not settings.PORTONE_API_SECRET:
        raise api_error(
            "PORTONE_NOT_CONFIGURED",
            status_code=503,
            message="결제가 설정되지 않았어요",
        )
    result = await portone.get_payment(order.order_no)
    _validate_payment(result, order)

    now = now_kst()
    attempt = await repo.latest_attempt(db, order.id)
    if attempt is not None:
        attempt.status = "paid"
        attempt.provider_payment_id = str(result.get("id") or order.order_no)
        attempt.paid_amount_krw = order.amount_krw
        attempt.payment_method = (result.get("method") or {}).get("type")
        attempt.receipt_url = result.get("receiptUrl") or result.get("receipt_url")
        attempt.paid_at = now
        attempt.raw_response = result

    order.status = "paid"
    order.paid_at = now

    request = (
        await db.execute(
            select(CertificateRequest).where(
                CertificateRequest.id == order.certificate_request_id
            )
        )
    ).scalar_one()
    request.status = "paid"
    request.paid_at = now
    certificate = await issuance_service.issue_certificate(db, request, order.id)
    await db.commit()

    return PaymentConfirmResponse(
        order_no=order.order_no,
        status=order.status,
        paid_at=order.paid_at,
        certificate=MyCertificateBrief.model_validate(certificate),
    )


async def confirm_payment(
    db: AsyncSession, trainee: Trainee, order_no: str
) -> PaymentConfirmResponse:
    """회원 수동 confirm — 소유 스코프(타인 주문 404) 후 공통 경로."""
    order = await repo.find_order_by_no(db, order_no, trainee_id=trainee.id)
    if order is None:
        raise api_error("NOT_FOUND", message="결제 주문을 찾을 수 없어요")
    return await confirm_order(db, order)
