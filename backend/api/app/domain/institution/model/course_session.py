import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.domain.institution.model.training_course import TrainingCourse


class CourseSession(Base):
    """교육 일정 — 과정의 실제 개설 회차. 교육이력은 이 일정에 교육생을 연결해 생성한다.

    schedule_no 에 구 시스템(EDC_SCHDL_SN)을 보존한다 — 원본이 단독 중복 5건이라
    unique 제약 없이 (course_id, schedule_no) 로 식별한다.
    """

    __tablename__ = "course_sessions"
    __table_args__ = (
        Index("ix_sessions_course_id", "course_id"),
        Index("ix_sessions_started_at", "started_at"),
        Index("ix_sessions_schedule_no", "schedule_no"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("training_courses.id", ondelete="CASCADE"), nullable=False
    )
    # 구 시스템 EDC_SCHDL_SN — 이관 데이터 추적용
    schedule_no: Mapped[int | None] = mapped_column()
    started_at: Mapped[date | None] = mapped_column(Date)
    ended_at: Mapped[date | None] = mapped_column(Date)
    total_hours: Mapped[Decimal] = mapped_column(
        Numeric(8, 2), nullable=False, default=Decimal(0)
    )
    recognized_hours: Mapped[Decimal] = mapped_column(
        Numeric(8, 2), nullable=False, default=Decimal(0)
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
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

    course: Mapped["TrainingCourse"] = relationship(
        "TrainingCourse", lazy="joined"
    )
