import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CertificateVerificationLog(Base):
    """진위확인 조회 이력 — 공개 화면, 개인정보 노출 최소화."""

    __tablename__ = "certificate_verification_logs"
    __table_args__ = (
        Index("ix_cvl_certificate_verified_at", "certificate_id", "verified_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    certificate_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("certificates.id", ondelete="SET NULL"), nullable=True
    )
    input_certificate_no: Mapped[str] = mapped_column(String(100), nullable=False)
    input_issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    result: Mapped[str] = mapped_column(String(30), nullable=False)
    requester_ip_hash: Mapped[str | None] = mapped_column(String(255))
    verified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
