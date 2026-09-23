import uuid
from datetime import date, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import name_hash
from app.domain.payment.model import (
    PaymentAttempt,
    PaymentOrder,
    PaymentWebhookEvent,
)
from app.domain.trainee.model import Trainee


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


def date_to_plus_one(d: date) -> date:
    return d + timedelta(days=1)


async def list_orders(
    db: AsyncSession,
    trainee_id: uuid.UUID | None = None,
    status: str | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
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
    if date_from is not None:
        cond = PaymentOrder.created_at >= date_from
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if date_to is not None:
        # 반열림 — 종료일 하루 전까지 (00:00 기준)
        cond = PaymentOrder.created_at < date_to_plus_one(date_to)
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if search:
        pattern = f"%{search}%"
        cond = or_(
            PaymentOrder.order_no.ilike(pattern),
            PaymentOrder.trainee_id.in_(
                select(Trainee.id).where(Trainee.name_hash == name_hash(search))
            ),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(PaymentOrder.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total
