import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TrainingRecord(Base):
    """교육이력 — 외부 수료도 기관·과정 등록 후 동일 구조로 관리 (external_completions 폐기)."""

    __tablename__ = "training_records"
    __table_args__ = (
        Index("ix_records_trainee_ended_at", "trainee_id", "ended_at"),
        Index("ix_records_course_id", "course_id"),
        Index("ix_records_institution_id", "institution_id"),
        Index("ix_records_completion_status", "completion_status"),
        Index("ix_records_source", "source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    training_record_no: Mapped[str] = mapped_column(
        String(100), nullable=False, unique=True
    )
    trainee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("trainees.id"), nullable=False
    )
    course_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("training_courses.id", ondelete="SET NULL"), nullable=True
    )
    institution_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("training_institutions.id", ondelete="SET NULL"), nullable=True
    )
    course_name: Mapped[str] = mapped_column(String(255), nullable=False)
    institution_name: Mapped[str] = mapped_column(String(255), nullable=False)
    total_hours: Mapped[Decimal] = mapped_column(
        Numeric(8, 2), nullable=False, default=Decimal(0)
    )
    completed_hours: Mapped[Decimal] = mapped_column(
        Numeric(8, 2), nullable=False, default=Decimal(0)
    )
    started_at: Mapped[date | None] = mapped_column(Date)
    ended_at: Mapped[date | None] = mapped_column(Date)
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="internal")
    evidence_file_key: Mapped[str | None] = mapped_column(Text)
    completion_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="completed"
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    memo: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
