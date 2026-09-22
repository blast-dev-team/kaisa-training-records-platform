import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CertificatePricingRule(Base):
    """등급별 발급 단가 — 가격 변경 시 기존 규칙 보존(과거 결제 금액 유지)."""

    __tablename__ = "certificate_pricing_rules"
    __table_args__ = (
        Index(
            "ix_cpr_grade_type_valid_from",
            "membership_grade_id",
            "issue_type",
            "valid_from",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    membership_grade_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("membership_grades.id"), nullable=False
    )
    issue_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="original"
    )
    price_krw: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="KRW")
    valid_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
