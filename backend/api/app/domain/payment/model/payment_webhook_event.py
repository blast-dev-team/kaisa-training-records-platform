import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PaymentWebhookEvent(Base):
    """웹훅 이벤트 — 중복 처리 방지 및 결제 상태 추적."""

    __tablename__ = "payment_webhook_events"
    __table_args__ = (
        UniqueConstraint(
            "provider", "provider_event_id", name="uq_webhook_provider_event"
        ),
        Index("ix_webhook_payment_attempt_id", "payment_attempt_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    provider: Mapped[str] = mapped_column(String(30), nullable=False, default="portone")
    provider_event_id: Mapped[str | None] = mapped_column(String(255))
    payment_attempt_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("payment_attempts.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    processing_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending"
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)
