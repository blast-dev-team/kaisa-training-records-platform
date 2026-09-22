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
    from app.domain.institution.model.session_name import SessionName
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
    # 회차명 마스터 참조 — 신규 등록부터 채워진다 (이관분 name 에 회차가 포함됨)
    session_name_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("session_names.id", ondelete="SET NULL"), nullable=True
    )
    # 외부 교육과정 — 감리원이 개인적으로 수료한 외부 교육(외부교육수강기록 이관분)
    is_external: Mapped[bool] = mapped_column(nullable=False, default=False)
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
    session_name: Mapped["SessionName | None"] = relationship("SessionName", lazy="joined")
