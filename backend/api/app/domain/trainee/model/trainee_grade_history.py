import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TraineeGradeHistory(Base):
    """등급 변경 이력 — 변경 시점 스냅샷 보존."""

    __tablename__ = "trainee_grade_histories"
    __table_args__ = (Index("ix_tgh_trainee_changed_at", "trainee_id", "changed_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    trainee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("trainees.id"), nullable=False
    )
    previous_grade_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("membership_grades.id", ondelete="SET NULL"), nullable=True
    )
    new_grade_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("membership_grades.id", ondelete="SET NULL"), nullable=True
    )
    change_reason: Mapped[str | None] = mapped_column(Text)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
