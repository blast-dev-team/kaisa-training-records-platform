import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.domain.identity.model.identity_verification import IdentityVerification
    from app.domain.user.model import User


class IdentityReview(Base):
    """본인인증 이후 기존 교육생 매칭·중복 확인·등급 판별 (비동기)."""

    __tablename__ = "identity_reviews"
    __table_args__ = (
        Index("ix_idr_user_created_at", "user_id", "created_at"),
        Index("ix_idr_trainee_id", "trainee_id"),
        Index("ix_idr_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    identity_verification_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("identity_verifications.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=False
    )
    trainee_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("trainees.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    matched_by: Mapped[str | None] = mapped_column(String(30))
    determined_grade_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("membership_grades.id", ondelete="SET NULL"), nullable=True
    )
    review_note: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    user: Mapped["User | None"] = relationship("User", lazy="joined")
    identity_verification: Mapped["IdentityVerification | None"] = relationship(
        "IdentityVerification", lazy="joined"
    )
