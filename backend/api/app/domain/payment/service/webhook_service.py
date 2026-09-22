"""PortOne 웹훅 수신 — 이벤트 중복 skip → 서명 검증 → confirm 재사용."""

import json
import logging

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.payment.model import PaymentWebhookEvent
from app.domain.payment.repository import payment_repository as repo
from app.domain.payment.service import payment_service
from app.integrations import portone

logger = logging.getLogger(__name__)


def _extract_payment_id(payload: dict) -> str | None:
    """PortOne v2 웹훅 — data 안의 payment 식별자. 필드명은 스테이징에서 확정."""
    data = payload.get("data") or {}
    if not isinstance(data, dict):
        return None
    for key in ("paymentId", "payment_id"):
        if data.get(key):
            return str(data[key])
    payment = data.get("payment")
    if isinstance(payment, dict):
        return str(payment.get("id")) if payment.get("id") else None
    return None


async def handle_portone_webhook(db: AsyncSession, signature: str, body: bytes) -> dict:
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise api_error(
            "WEBHOOK_INVALID_PAYLOAD", message="웹훅 본문이 올바르지 않아요"
        )

    event_id = payload.get("webhookId") or payload.get("webhook_id")
    if not event_id:
        raise api_error(
            "WEBHOOK_INVALID_PAYLOAD", message="웹훅 이벤트 식별자가 없어요"
        )

    # 중복 수신 — (provider, provider_event_id) unique. 이미 처리됐으면 멱등 OK.
    if await repo.find_webhook_event(db, "portone", str(event_id)):
        return {"ok": True, "duplicate": True}

    if not portone.verify_webhook_signature(signature, body):
        raise api_error(
            "WEBHOOK_SIGNATURE_INVALID", message="웹훅 서명이 올바르지 않아요"
        )

    event = PaymentWebhookEvent(
        provider="portone",
        provider_event_id=str(event_id),
        event_type=str(payload.get("type") or "unknown"),
        payload=payload,
        processing_status="pending",
        received_at=now_kst(),
    )
    db.add(event)

    payment_id = _extract_payment_id(payload)
    order = await repo.find_order_by_no(db, payment_id) if payment_id else None
    if order is None:
        # 알 수 없는 결제 — 200 로 응답(재시도 유발 없이)하고 로그로만 남긴다
        event.processing_status = "processed"
        event.error_message = "order not found"
        event.processed_at = now_kst()
        await db.commit()
        return {"ok": True, "order_found": False}

    try:
        await payment_service.confirm_order(db, order)
    except HTTPException as exc:  # 결제 미완료 등 비즈니스 거부 — 기록 후 200
        # confirm 의 부분 변경이 같은 세션에 남아 있으니 rollback 후 이벤트만 재기록
        await db.rollback()
        failure = PaymentWebhookEvent(
            provider="portone",
            provider_event_id=str(event_id),
            event_type=str(payload.get("type") or "unknown"),
            payload=payload,
            processing_status="failed",
            error_message=str(exc.detail)[:500],
            received_at=now_kst(),
            processed_at=now_kst(),
        )
        db.add(failure)
        await db.commit()
        logger.warning("webhook confirm rejected: %s", exc.detail)
        return {"ok": True, "order_found": True, "confirmed": False}

    event.payment_attempt_id = (
        (await repo.latest_attempt(db, order.id)).id if order.id else None
    )
    event.processing_status = "processed"
    event.processed_at = now_kst()
    await db.commit()
    return {"ok": True, "order_found": True, "confirmed": True}
