import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class IdentityVerification(Base):
    """PASS 본인인증 — Redirect 이후 서버에서 포트원 결과 검증 후 성공 처리."""

    __tablename__ = "identity_verifications"
    __table_args__ = (
        Index("ix_idv_user_created_at", "user_id", "created_at"),
        Index("ix_idv_ci_hash", "ci_hash"),
        Index("ix_idv_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(30), nullable=False, default="portone")
    provider_verification_id: Mapped[str | None] = mapped_column(
        String(255), unique=True
    )
    redirect_state_hash: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    verified_name: Mapped[str | None] = mapped_column(String(100))
    verified_phone_encrypted: Mapped[str | None] = mapped_column(Text)
    ci_hash: Mapped[str | None] = mapped_column(String(255))
    di_hash: Mapped[str | None] = mapped_column(String(255))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_code: Mapped[str | None] = mapped_column(String(100))
    failure_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
