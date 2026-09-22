import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PaymentAttempt(Base):
    """결제 시도 — 실패·재시도 보존 (삭제 안 함). 포트원 서버 검증 후 상태 확정."""

    __tablename__ = "payment_attempts"
    __table_args__ = (
        UniqueConstraint("payment_order_id", "attempt_no", name="uq_attempts_order_no"),
        Index("ix_attempts_status_created_at", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    payment_order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("payment_orders.id", ondelete="CASCADE"), nullable=False
    )
    attempt_no: Mapped[int] = mapped_column(Integer, nullable=False)
    provider: Mapped[str] = mapped_column(String(30), nullable=False, default="portone")
    provider_payment_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    merchant_payment_id: Mapped[str | None] = mapped_column(String(255))
    payment_method: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ready")
    requested_amount_krw: Mapped[int] = mapped_column(Integer, nullable=False)
    paid_amount_krw: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    receipt_url: Mapped[str | None] = mapped_column(Text)
    failure_code: Mapped[str | None] = mapped_column(String(100))
    failure_message: Mapped[str | None] = mapped_column(Text)
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    raw_response: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
