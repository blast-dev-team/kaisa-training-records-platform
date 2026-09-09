import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.payment.model import (
    PaymentAttempt,
    PaymentOrder,
    PaymentWebhookEvent,
)


async def find_order_by_no(
    db: AsyncSession, order_no: str, trainee_id: uuid.UUID | None = None
) -> PaymentOrder | None:
    """trainee_id 를 주면 소유 스코프 — 타인 주문은 None(→404)."""
    stmt = select(PaymentOrder).where(PaymentOrder.order_no == order_no)
    if trainee_id is not None:
        stmt = stmt.where(PaymentOrder.trainee_id == trainee_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def find_order_by_id(
    db: AsyncSession, order_id: uuid.UUID
) -> PaymentOrder | None:
    result = await db.execute(select(PaymentOrder).where(PaymentOrder.id == order_id))
    return result.scalar_one_or_none()


async def latest_attempt(
    db: AsyncSession, order_id: uuid.UUID
) -> PaymentAttempt | None:
    result = await db.execute(
        select(PaymentAttempt)
        .where(PaymentAttempt.payment_order_id == order_id)
        .order_by(PaymentAttempt.attempt_no.desc())
    )
    return result.scalars().first()


async def find_webhook_event(
    db: AsyncSession, provider: str, provider_event_id: str
) -> PaymentWebhookEvent | None:
    result = await db.execute(
        select(PaymentWebhookEvent).where(
            PaymentWebhookEvent.provider == provider,
            PaymentWebhookEvent.provider_event_id == provider_event_id,
        )
    )
    return result.scalar_one_or_none()


async def list_orders(
    db: AsyncSession,
    trainee_id: uuid.UUID | None = None,
    status: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[PaymentOrder], int]:
    stmt = select(PaymentOrder)
    count_stmt = select(func.count()).select_from(PaymentOrder)
    if trainee_id:
        stmt = stmt.where(PaymentOrder.trainee_id == trainee_id)
        count_stmt = count_stmt.where(PaymentOrder.trainee_id == trainee_id)
    if status:
        stmt = stmt.where(PaymentOrder.status == status)
        count_stmt = count_stmt.where(PaymentOrder.status == status)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(PaymentOrder.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total
