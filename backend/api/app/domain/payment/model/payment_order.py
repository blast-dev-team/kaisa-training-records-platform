import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PaymentOrder(Base):
    """결제 주문 — certificate_request 와 1:1."""

    __tablename__ = "payment_orders"
    __table_args__ = (
        Index("ix_po_trainee_created_at", "trainee_id", "created_at"),
        Index("ix_po_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_no: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    certificate_request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("certificate_requests.id"), nullable=False, unique=True
    )
    trainee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("trainees.id"), nullable=False
    )
    amount_krw: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="KRW")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ready")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
