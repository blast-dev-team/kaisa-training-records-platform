"""어드민 — 결제 주문 조회·환불."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.config import settings
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.auth.model import AdminUser
from app.domain.certificate.model import Certificate
from app.domain.payment.model import PaymentOrder, PaymentRefund
from app.domain.payment.repository import payment_repository as repo
from app.integrations import portone


async def list_orders(
    db: AsyncSession,
    trainee_id: uuid.UUID | None = None,
    status: str | None = None,
    search: str | None = None,
    date_from=None,
    date_to=None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[PaymentOrder], int]:
    return await repo.list_orders(
        db,
        trainee_id=trainee_id,
        status=status,
        search=search,
        date_from=date_from,
        date_to=date_to,
        page=page,
        limit=limit,
    )


async def refund_order(
    db: AsyncSession,
    order_id: uuid.UUID,
    reason: str,
    actor: AdminUser,
    force: bool = False,
) -> PaymentOrder:
    """환불 — PortOne 취소 → refunds row → 주문 상태.

    유효한 확인서가 발급된 주문은 차단(미발급만 환불). 오류 정정은 force=True.
    """
    order = await repo.find_order_by_id(db, order_id)
    if order is None:
        raise api_error("NOT_FOUND", message="결제 주문을 찾을 수 없어요")
    if order.status != "paid":
        raise api_error(
            "INVALID_STATUS_TRANSITION", message="결제 완료된 주문만 환불할 수 있어요"
        )

    # 이 결제로 발급된 유효 확인서 — 환불과 함께 전부 폐기 (이력 정정 포함 무조건)
    valid_certs = (
        await db.execute(
            select(Certificate).where(
                Certificate.payment_order_id == order.id,
                Certificate.revoked_at.is_(None),
            )
        )
    ).scalars().all()
    now = now_kst()
    for cert in valid_certs:
        cert.status = "revoked"
        cert.revoked_at = now
        cert.revoked_reason = reason

    attempt = await repo.latest_attempt(db, order.id)
    provider_refund_id = None
    if attempt is not None and attempt.provider_payment_id:
        if not settings.PORTONE_API_SECRET:
            raise api_error(
                "PORTONE_NOT_CONFIGURED",
                status_code=503,
                message="결제가 설정되지 않았어요",
            )
        canceled = await portone.cancel_payment(attempt.provider_payment_id, reason)
        cancellation = canceled.get("cancellation") or canceled
        provider_refund_id = (
            str(cancellation.get("id") or cancellation.get("cancellationId") or "")
            or None
        )

    now = now_kst()
    db.add(
        PaymentRefund(
            payment_attempt_id=attempt.id if attempt else None,
            provider_refund_id=provider_refund_id,
            amount_krw=order.amount_krw,
            reason=reason,
            status="succeeded",
            requested_by=actor.id,
            requested_at=now,
            completed_at=now,
        )
    )
    order.status = "refunded"
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="payment_order.refunded",
        entity_type="payment_order",
        entity_id=order.id,
        before={"status": "paid"},
        after={
            "status": "refunded",
            "reason": reason,
            "force_issued": force,
            "revoked_certificates": len(valid_certs),
        },
    )
    await db.commit()
    await db.refresh(order)
    return order
