"""어드민 — 결제 주문 조회·환불."""

import uuid
from datetime import timedelta

from fastapi import HTTPException
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
) -> tuple[list[PaymentOrder], int, dict[uuid.UUID, int], dict[uuid.UUID, str]]:
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


async def get_order(db: AsyncSession, order_id: uuid.UUID) -> PaymentOrder:
    order = await repo.find_order_by_id(db, order_id)
    if order is None:
        raise api_error("NOT_FOUND", message="결제 주문을 찾을 수 없어요")
    return order


# 환불 행이 pending 으로 남은 채 이 시간이 지나면(서버가 2단계 사이에 죽은 경우 등)
# 진행 중으로 보지 않고 PortOne 상태로 정리한다
_STUCK_REFUND_AFTER = timedelta(minutes=2)


async def _pg_cancel_state(payment_id: str) -> bool | None:
    """PortOne 에서 실제로 취소됐는지. True=취소됨 / False=취소 안 됨 / None=확인 불가.

    확인 불가(조회 장애)를 '취소 안 됨'으로 단정하면, 실제로는 환불됐는데 확인서가
    유효한 채로 "결제는 그대로"라고 안내하게 된다 — 그래서 셋을 구분한다.
    """
    try:
        result = await portone.get_payment(payment_id)
    except HTTPException:
        return None
    return (result or {}).get("status") == "CANCELLED"


async def _lock_order(db: AsyncSession, order_id: uuid.UUID) -> PaymentOrder | None:
    """주문 행 잠금 + DB 최신값으로 다시 읽기 (다른 트랜잭션이 바꿨을 수 있다)."""
    return (
        await db.execute(
            select(PaymentOrder)
            .where(PaymentOrder.id == order_id)
            .with_for_update(of=PaymentOrder)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()


async def _pending_refund(
    db: AsyncSession, attempt_id: uuid.UUID
) -> PaymentRefund | None:
    return (
        (
            await db.execute(
                select(PaymentRefund)
                .where(
                    PaymentRefund.payment_attempt_id == attempt_id,
                    PaymentRefund.status == "pending",
                )
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .first()
    )


async def _apply_refund(
    db: AsyncSession,
    order: PaymentOrder,
    refund: PaymentRefund,
    reason: str,
    actor_admin_id: uuid.UUID | None,
    *,
    force: bool = False,
    source: str = "admin",
) -> None:
    """PG 취소가 확인된 뒤에만 부른다 — 주문 환불 처리 + 확인서 전부 폐기 + 감사로그."""
    now = now_kst()
    valid_certs = (
        (
            await db.execute(
                select(Certificate).where(
                    Certificate.payment_order_id == order.id,
                    Certificate.revoked_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    for cert in valid_certs:
        cert.status = "revoked"
        cert.revoked_at = now
        cert.revoked_reason = reason
    refund.status = "succeeded"
    refund.completed_at = now
    order.status = "refunded"
    record_audit(
        db,
        actor_admin_id=actor_admin_id,
        action="payment_order.refunded",
        entity_type="payment_order",
        entity_id=order.id,
        before={"status": "paid"},
        after={
            "status": "refunded",
            "reason": reason,
            "force_issued": force,
            "revoked_certificates": len(valid_certs),
            "source": source,
        },
    )


async def refund_order(
    db: AsyncSession,
    order_id: uuid.UUID,
    reason: str,
    actor: AdminUser,
    force: bool = False,
) -> PaymentOrder:
    """어드민 환불 — 주문 단위 전액. 묶음 결제면 그 결제로 발급된 확인서가 전부 폐기된다.

    PG 호출을 DB 트랜잭션 밖으로 뺀 2단계 처리다:
      1) 주문 행 잠금 → 환불 행을 pending 으로 커밋 (동시에 누른 두 번째 요청은 여기서 막힌다)
      2) PortOne 취소 → 성공이면 확정. 실패·타임아웃이면 PortOne 을 다시 조회해
         취소됨=확정 / 취소 안 됨=failed / 확인 불가=pending 유지(웹훅·재시도가 정리)
    예전엔 한 트랜잭션이라, PG 는 취소됐는데 응답이 끊기면 DB 가 롤백돼 '결제 완료'로
    남고 확인서도 유효했다. 재시도하면 PG 가 '이미 취소됨'을 돌려줘 영원히 환불할 수 없었다.
    PG 취소 직후 도착하는 취소 웹훅은 같은 pending 행을 확정하므로 환불이 두 번 잡히지 않는다.
    """
    order = await _lock_order(db, order_id)
    if order is None:
        raise api_error("NOT_FOUND", message="결제 주문을 찾을 수 없어요")
    if order.status != "paid":
        raise api_error(
            "INVALID_STATUS_TRANSITION", message="결제 완료된 주문만 환불할 수 있어요"
        )
    attempt = await repo.latest_attempt(db, order.id)
    if attempt is None or not attempt.provider_payment_id:
        raise api_error(
            "INVALID_STATUS_TRANSITION", message="결제 기록이 없어 환불할 수 없어요"
        )
    if not settings.PORTONE_API_SECRET:
        raise api_error(
            "PORTONE_NOT_CONFIGURED",
            status_code=503,
            message="결제가 설정되지 않았어요",
        )
    payment_id = attempt.provider_payment_id

    in_flight = await _pending_refund(db, attempt.id)
    if in_flight is not None:
        state = await _pg_cancel_state(payment_id)
        if state is True:
            # 이전 요청이 PG 취소까지 갔는데 마무리를 못 했다 — 그 기록으로 마무리
            await _apply_refund(
                db,
                order,
                in_flight,
                in_flight.reason or reason,
                in_flight.requested_by or actor.id,
                force=force,
            )
            await db.commit()
            await db.refresh(order)
            return order
        if state is None or in_flight.requested_at > now_kst() - _STUCK_REFUND_AFTER:
            raise api_error(
                "INVALID_STATUS_TRANSITION",
                status_code=409,
                message="환불이 처리 중이에요. 잠시 후 결제 상태를 확인해 주세요",
            )
        in_flight.status = "failed"  # 오래 묵었고 PG 도 취소 안 됨 — 새 요청으로 진행
        in_flight.completed_at = now_kst()

    # 1단계 — 요청 기록. 커밋하면 잠금이 풀리지만 pending 행이 중복 요청을 막는다
    refund = PaymentRefund(
        payment_attempt_id=attempt.id,
        amount_krw=order.amount_krw,
        reason=reason,
        status="pending",
        requested_by=actor.id,
        requested_at=now_kst(),
    )
    db.add(refund)
    await db.commit()
    refund_id = refund.id

    # 2단계 — PG 취소 (트랜잭션 밖)
    provider_refund_id = None
    try:
        canceled = await portone.cancel_payment(payment_id, reason)
        cancellation = canceled.get("cancellation") or canceled
        provider_refund_id = (
            str(cancellation.get("id") or cancellation.get("cancellationId") or "")
            or None
        )
    except HTTPException:
        state = await _pg_cancel_state(payment_id)
        if state is None:
            # 확인 불가 — pending 으로 둔다. 취소 웹훅이나 다음 환불 시도가 PG 상태로 정리한다
            raise api_error(
                "PORTONE_API_ERROR",
                message="PG 응답을 확인하지 못했어요. 환불이 됐을 수 있으니 잠시 후 결제 상태를 다시 확인해 주세요",
            )
        if state is False:
            failed = await db.get(PaymentRefund, refund_id, populate_existing=True)
            if failed is not None and failed.status == "pending":
                failed.status = "failed"
                failed.completed_at = now_kst()
                await db.commit()
            raise api_error(
                "PORTONE_API_ERROR",
                message="PG 환불에 실패했어요. 결제는 그대로이고 확인서도 유효해요. 잠시 후 다시 시도해 주세요",
            )
        # state True — 응답은 끊겼지만 PG 에서는 취소됨

    # 확정 — 다시 잠그고 최신 상태를 본다. 그 사이 취소 웹훅이 먼저 확정했을 수 있다
    order = await _lock_order(db, order_id)
    refund = await db.get(PaymentRefund, refund_id, populate_existing=True)
    if order is None or refund is None:
        raise api_error("NOT_FOUND", message="결제 주문을 찾을 수 없어요")
    if refund.status == "pending" and order.status == "paid":
        refund.provider_refund_id = provider_refund_id
        await _apply_refund(db, order, refund, reason, actor.id, force=force)
    elif provider_refund_id and refund.provider_refund_id is None:
        refund.provider_refund_id = provider_refund_id
    await db.commit()
    await db.refresh(order)
    return order


async def sync_provider_cancellation(db: AsyncSession, order: PaymentOrder) -> str:
    """PortOne 콘솔·PG 에서 취소된 결제를 반영한다(취소 웹훅). 커밋까지 한다.

    - 어드민 환불이 진행 중(pending 행)이면 새 행을 만들지 않고 그 행을 확정한다
      — 어드민 PG 취소 직후 웹훅이 먼저 도착해도 환불이 두 번 잡히지 않는다.
    - 이미 refunded 면 아무것도 하지 않는다.
    - 부분 취소는 지원하지 않으므로 상태를 바꾸지 않고 사람이 보게 남긴다.
    """
    if order.status != "paid":
        return "noop"
    result = await portone.get_payment(order.order_no)  # 잠금 전에 — HTTP 중 잠금 보유 방지
    status = (result or {}).get("status")
    if status == "PARTIAL_CANCELLED":
        return "partial"
    if status != "CANCELLED":
        return "noop"

    locked = await _lock_order(db, order.id)
    if locked is None or locked.status != "paid":
        await db.commit()
        return "noop"
    attempt = await repo.latest_attempt(db, locked.id)
    if attempt is None:
        await db.commit()
        return "noop"
    refund = await _pending_refund(db, attempt.id)
    if refund is not None:
        await _apply_refund(
            db, locked, refund, refund.reason or "환불", refund.requested_by
        )
    else:
        refund = PaymentRefund(
            payment_attempt_id=attempt.id,
            amount_krw=locked.amount_krw,
            reason="PG 에서 직접 취소됨",
            status="pending",
            requested_at=now_kst(),
        )
        db.add(refund)
        await _apply_refund(
            db, locked, refund, "PG 에서 직접 취소됨", None, source="provider_webhook"
        )
    await db.commit()
    return "refunded"
