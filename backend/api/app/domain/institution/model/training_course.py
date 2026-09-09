import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.domain.institution.model.training_institution import TrainingInstitution


class TrainingCourse(Base):
    """교육과정 마스터 — 동일 과정에 여러 교육생 이력 연결."""

    __tablename__ = "training_courses"
    __table_args__ = (
        Index("ix_courses_institution_id", "institution_id"),
        Index("ix_courses_name", "name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    course_code: Mapped[str | None] = mapped_column(String(100), unique=True)
    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("training_institutions.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    total_hours: Mapped[Decimal] = mapped_column(
        Numeric(8, 2), nullable=False, default=Decimal(0)
    )
    category: Mapped[str | None] = mapped_column(String(100))
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

    institution: Mapped["TrainingInstitution"] = relationship(
        "TrainingInstitution", lazy="joined"
    )
