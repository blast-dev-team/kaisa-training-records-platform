import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PaymentOrder(Base):
    """결제 주문 — 단건은 certificate_request 와 1:1, 다건 발급은 N건과 1:N.

    다건 발급에서는 certificate_request_id 가 비고(null)이고, 신청 쪽
    certificate_requests.payment_order_id 가 주문을 가리킨다.
    """

    __tablename__ = "payment_orders"
    __table_args__ = (
        Index("ix_po_trainee_created_at", "trainee_id", "created_at"),
        Index("ix_po_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_no: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    # 레거시 단건 링크 — 다건 발급 주문은 null (unique라 여러 null 허용)
    certificate_request_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("certificate_requests.id"), nullable=True, unique=True
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
