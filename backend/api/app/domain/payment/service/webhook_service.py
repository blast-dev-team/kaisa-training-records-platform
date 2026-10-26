"""PortOne 웹훅 수신 — 이벤트 중복 skip → 서명 검증 → confirm 재사용."""

import json
import logging

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.payment.model import PaymentWebhookEvent
from app.domain.payment.repository import payment_repository as repo
from app.domain.payment.service import payment_service, refund_service
from app.integrations import portone

logger = logging.getLogger(__name__)


def _extract_payment_id(payload: dict) -> str | None:
    """PortOne v2 웹훅 — 결제 식별자.

    2024-04-25 형식은 `data.paymentId`, 구 2024-01-01 형식은 최상위 `payment_id`
    (type 없음). 콘솔의 웹훅 버전 설정에 따라 둘 다 올 수 있다.
    """
    for key in ("payment_id", "paymentId"):
        if payload.get(key):
            return str(payload[key])
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


# 결제 확정을 시도할 이벤트. type 이 없으면(구 형식) 확정을 시도한다 — confirm 은
# 항상 PortOne 을 다시 조회하므로 잘못 불려도 안전하다
_PAID_EVENTS = {"Transaction.Paid"}
_CANCEL_EVENTS = {"Transaction.Cancelled", "Transaction.PartialCancelled"}
# PortOne 이 다시 보내면 될 일시적 실패 — 이때는 5xx 로 응답해 재전송을 받는다
_TRANSIENT_CODES = {"PORTONE_API_ERROR", "PORTONE_NOT_CONFIGURED"}
_MAX_BODY_BYTES = 64 * 1024


async def _record(
    db: AsyncSession,
    event_id: str,
    payload: dict,
    status: str,
    *,
    error: str | None = None,
    attempt_id=None,
) -> None:
    """이벤트 기록 upsert — 실패했던 이벤트를 재처리하면 같은 행을 갱신한다."""
    event = await repo.find_webhook_event(db, "portone", event_id)
    if event is None:
        event = PaymentWebhookEvent(
            provider="portone",
            provider_event_id=event_id,
            received_at=now_kst(),
        )
        db.add(event)
    event.event_type = str(payload.get("type") or "unknown")
    event.payload = payload
    event.processing_status = status
    event.error_message = error[:500] if error else None
    event.processed_at = now_kst()
    if attempt_id is not None:
        event.payment_attempt_id = attempt_id
    await db.commit()


def _error_code(exc: HTTPException) -> str | None:
    return exc.detail.get("code") if isinstance(exc.detail, dict) else None


async def handle_portone_webhook(
    db: AsyncSession, headers: dict[str, str], body: bytes
) -> dict:
    """PortOne V2 웹훅 — 서명 검증 → 처리 완료 이벤트만 중복으로 skip → 결제 확정/취소 반영.

    예전 구현은 실패한 이벤트도 같은 ID 로 저장해, PortOne 이 다시 보내도 '중복'으로
    무시했다. 그래서 PortOne API 가 잠깐 실패하면 그 결제는 영영 발급되지 않았다.
    """
    if len(body) > _MAX_BODY_BYTES:
        raise api_error("WEBHOOK_INVALID_PAYLOAD", message="웹훅 본문이 너무 커요")
    event_id = headers.get("webhook-id", "")
    if not portone.verify_webhook_signature(
        event_id,
        headers.get("webhook-timestamp", ""),
        headers.get("webhook-signature", ""),
        body,
    ):
        raise api_error(
            "WEBHOOK_SIGNATURE_INVALID", message="웹훅 서명이 올바르지 않아요"
        )
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise api_error(
            "WEBHOOK_INVALID_PAYLOAD", message="웹훅 본문이 올바르지 않아요"
        )
    if not isinstance(payload, dict):
        raise api_error("WEBHOOK_INVALID_PAYLOAD", message="웹훅 본문이 올바르지 않아요")

    existing = await repo.find_webhook_event(db, "portone", event_id)
    if existing is not None and existing.processing_status == "processed":
        return {"ok": True, "duplicate": True}

    event_type = payload.get("type")
    payment_id = _extract_payment_id(payload)
    order = await repo.find_order_by_no(db, payment_id) if payment_id else None
    if order is None:
        # 알 수 없는 결제 — 재전송을 부르지 않게 200, 기록만 남긴다
        await _record(db, event_id, payload, "processed", error="order not found")
        return {"ok": True, "order_found": False}

    try:
        if event_type in _CANCEL_EVENTS:
            outcome = await refund_service.sync_provider_cancellation(db, order)
            note = "partial cancel — 부분 취소는 미지원, 수동 확인 필요" if outcome == "partial" else None
            await _record(db, event_id, payload, "processed", error=note)
            return {"ok": True, "order_found": True, "cancellation": outcome}
        if event_type and event_type not in _PAID_EVENTS:
            # Ready·Failed·PayPending 등 — 발급과 무관. 결제 대기 주문은 대사 작업이 정리한다
            await _record(db, event_id, payload, "processed", error="ignored event type")
            return {"ok": True, "order_found": True, "ignored": True}
        await payment_service.confirm_order(db, order)
    except HTTPException as exc:
        await db.rollback()
        await _record(db, event_id, payload, "failed", error=str(exc.detail))
        if _error_code(exc) in _TRANSIENT_CODES:
            logger.warning("webhook transient failure, asking retry: %s", exc.detail)
            raise api_error(
                "PORTONE_API_ERROR",
                status_code=503,
                message="일시적인 오류로 처리하지 못했어요",
            )
        logger.warning("webhook confirm rejected: %s", exc.detail)
        return {"ok": True, "order_found": True, "confirmed": False}
    except Exception:
        await db.rollback()
        await _record(db, event_id, payload, "failed", error="unexpected error")
        raise

    attempt = await repo.latest_attempt(db, order.id)
    await _record(
        db, event_id, payload, "processed", attempt_id=attempt.id if attempt else None
    )
    return {"ok": True, "order_found": True, "confirmed": True}
