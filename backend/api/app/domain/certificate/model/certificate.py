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


class Certificate(Base):
    """발급된 확인서 — 당시 교육정보 스냅샷 보존."""

    __tablename__ = "certificates"
    __table_args__ = (
        Index("ix_cert_trainee_issued_at", "trainee_id", "issued_at"),
        Index("ix_cert_record_issued_at", "training_record_id", "issued_at"),
        Index("ix_cert_no_issued_at", "certificate_no", "issued_at"),
        Index("ix_certificates_bundle_no", "bundle_no"),
        Index("ix_certificates_issued_name_hash", "issued_name_hash"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    certificate_no: Mapped[str] = mapped_column(
        String(100), nullable=False, unique=True
    )
    # 묶음 확인서 번호 — 한 번의 발급 이벤트가 공유하는 표시 번호.
    # 첫 확인서의 certificate_no 를 쓴다(별도 채번 없음). 기존 건은 자기 번호로 백필됨
    bundle_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # 확인서 문서번호 — 발급 이벤트(문서)당 1회 채번 `정감 제{YY}-E{NNNN}호`,
    # 묶음 멤버 전부 같은 값을 가진다(bundle_no 와 같은 복제). 재발급은 새 문서라 새 번호
    doc_no: Mapped[str | None] = mapped_column(String(100))
    certificate_request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("certificate_requests.id"), nullable=False, unique=True
    )
    trainee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("trainees.id"), nullable=False
    )
    training_record_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("training_records.id"), nullable=False
    )
    payment_order_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("payment_orders.id", ondelete="SET NULL"), nullable=True
    )
    # 발급 당시 성명 스냅샷 — Fernet 가역 저장 + HMAC blind index
    issued_name_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    issued_name_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    course_name: Mapped[str] = mapped_column(String(255), nullable=False)
    institution_name: Mapped[str] = mapped_column(String(255), nullable=False)
    total_hours: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    completed_hours: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    training_started_at: Mapped[date | None] = mapped_column(Date)
    training_ended_at: Mapped[date | None] = mapped_column(Date)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="issued")
    # WEB에서 PDF 저장한 기록 — 다운로드는 브라우저에서 일어나 로그 호출로만 인지
    downloaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    download_count: Mapped[int] = mapped_column(nullable=False, default=0)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_reason: Mapped[str | None] = mapped_column(Text)
    pdf_file_key: Mapped[str | None] = mapped_column(Text)
    pdf_sha256: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
