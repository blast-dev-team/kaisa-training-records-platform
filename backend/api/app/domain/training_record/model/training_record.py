import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.domain.institution.model.training_institution import TrainingInstitution
    from app.domain.trainee.model import Trainee


class TrainingRecord(Base):
    """교육이력 — 외부 수료도 기관·과정 등록 후 동일 구조로 관리 (external_completions 폐기)."""

    __tablename__ = "training_records"
    __table_args__ = (
        Index("ix_records_trainee_ended_at", "trainee_id", "ended_at"),
        Index("ix_records_course_id", "course_id"),
        Index("ix_records_session_id", "session_id"),
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
    # 연결된 교육 일정 — 일정 등록 후 교육생 연결로 생성된 이력만 갖는다
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("course_sessions.id", ondelete="SET NULL"), nullable=True
    )
    institution_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("training_institutions.id", ondelete="SET NULL"), nullable=True
    )
    course_name: Mapped[str] = mapped_column(String(255), nullable=False)
    institution_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # 감리원 등급 (예: 정감리원, 부감리원)
    supervisor_grade: Mapped[str | None] = mapped_column(String(50))
    # 감리원증 발급번호
    supervisor_cert_no: Mapped[str | None] = mapped_column(String(100))
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
    # 데모 이력 — 모든 로그인 회원이 조회·다운로드할 수 있는 공용 시드 데이터
    is_demo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=func.false()
    )
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

    # 어드민 목록에 교육생 이름·번호를 응답에 실기 위한 참조 (응답 스키마 from_orm 용)
    trainee: Mapped["Trainee | None"] = relationship("Trainee", lazy="joined")
    # 수료증 발급 자격 판정용 기관 구분(institution_type) 읽기 — from_orm 용
    institution: Mapped["TrainingInstitution | None"] = relationship(
        "TrainingInstitution", lazy="joined"
    )
