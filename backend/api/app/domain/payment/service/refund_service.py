"""어드민 — 결제 주문 조회·환불."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.config import settings
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.auth.model import AdminUser
from app.domain.payment.model import PaymentOrder, PaymentRefund
from app.domain.payment.repository import payment_repository as repo
from app.integrations import portone


async def list_orders(
    db: AsyncSession,
    trainee_id: uuid.UUID | None = None,
    status: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[PaymentOrder], int]:
    return await repo.list_orders(
        db, trainee_id=trainee_id, status=status, page=page, limit=limit
    )


async def refund_order(
    db: AsyncSession, order_id: uuid.UUID, reason: str, actor: AdminUser
) -> PaymentOrder:
    """환불 — PortOne 취소 → refunds row → 주문 상태. 확인서 폐기는 별도 운영 판단."""
    order = await repo.find_order_by_id(db, order_id)
    if order is None:
        raise api_error("NOT_FOUND", message="결제 주문을 찾을 수 없어요")
    if order.status != "paid":
        raise api_error(
            "INVALID_STATUS_TRANSITION", message="결제 완료된 주문만 환불할 수 있어요"
        )

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
        after={"status": "refunded", "reason": reason},
    )
    await db.commit()
    await db.refresh(order)
    return order
