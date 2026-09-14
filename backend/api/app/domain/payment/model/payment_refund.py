import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PaymentRefund(Base):
    """환불 — 관리자 요청, 포트원 처리 결과 기록."""

    __tablename__ = "payment_refunds"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    payment_attempt_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("payment_attempts.id", ondelete="CASCADE"), nullable=False
    )
    provider_refund_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    amount_krw: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    requested_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
