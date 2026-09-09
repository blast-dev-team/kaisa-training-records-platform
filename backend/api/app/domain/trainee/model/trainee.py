import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.domain.trainee.model.membership_grade import MembershipGrade
    from app.domain.user.model.user import User


class Trainee(Base):
    """교육생 — CI 는 users.ci_hash 단일 소스. 이관 시 CI 보유분은 user_id 로 미리 연결."""

    __tablename__ = "trainees"
    __table_args__ = (
        Index("ix_trainees_name", "name"),
        Index("ix_trainees_membership_grade_id", "membership_grade_id"),
        Index("ix_trainees_review_status", "review_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    trainee_no: Mapped[str | None] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone_encrypted: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(String(255))
    membership_grade_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("membership_grades.id", ondelete="SET NULL"), nullable=True
    )
    review_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="unverified"
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    memo: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User | None"] = relationship("User", lazy="joined")
    grade: Mapped["MembershipGrade | None"] = relationship(
        "MembershipGrade", lazy="joined"
    )
