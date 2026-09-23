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


class CompletionCertificate(Base):
    """수료증 — 내부 기관 수료내역 1건당 1장. 당시 정보 스냅샷 보존.

    번호는 `YYYY-MM-NNN호`(월별 리셋 연번) 표시 형식 그대로 저장한다 —
    진위확인 입력값과 동일 형태라 정규화 없이 비교된다.
    """

    __tablename__ = "completion_certificates"
    __table_args__ = (
        Index("ix_completion_cert_no_issued_at", "certificate_no", "issued_at"),
        Index("ix_completion_cert_trainee_issued_at", "trainee_id", "issued_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    certificate_no: Mapped[str] = mapped_column(
        String(30), nullable=False, unique=True
    )
    # 1 이력 = 1 수료증 — 재발급 요청은 기존 수료증을 재사용한다(멱등)
    training_record_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("training_records.id"), nullable=False, unique=True
    )
    trainee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("trainees.id"), nullable=False
    )
    # 발급 시점 성명 스냅샷 — Fernet 가역 저장 + HMAC blind index (확인서와 동일)
    issued_name_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    issued_name_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    trainee_birth_date: Mapped[date | None] = mapped_column(Date)
    course_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # 교육과정(회차명) — 발급 시점 연결 과정의 회차명. 과정·일정 미연결이면 NULL
    session_name: Mapped[str | None] = mapped_column(String(255))
    institution_name: Mapped[str] = mapped_column(String(255), nullable=False)
    completed_hours: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    started_at: Mapped[date | None] = mapped_column(Date)
    ended_at: Mapped[date | None] = mapped_column(Date)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="issued")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
