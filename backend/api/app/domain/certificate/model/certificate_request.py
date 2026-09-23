import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.domain.certificate.model.certificate import Certificate
    from app.domain.payment.model.payment_order import PaymentOrder


class CertificateRequest(Base):
    """확인서 발급 요청 — 서버에서 등급·가격 재판별 후 금액 스냅샷 저장."""

    __tablename__ = "certificate_requests"
    __table_args__ = (
        Index("ix_creq_trainee_requested_at", "trainee_id", "requested_at"),
        Index("ix_creq_training_record_id", "training_record_id"),
        Index("ix_creq_status", "status"),
    )

    # 응답 조립용 — 신청이 속한 주문. 다건 발급은 여러 신청이 하나의 주문을 공유한다 (N:1)
    payment_order: Mapped["PaymentOrder | None"] = relationship(
        "PaymentOrder",
        lazy="selectin",
        foreign_keys="CertificateRequest.payment_order_id",
    )
    certificates: Mapped[list["Certificate"]] = relationship(
        "Certificate",
        lazy="selectin",
        foreign_keys="Certificate.certificate_request_id",
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    request_no: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    trainee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("trainees.id"), nullable=False
    )
    training_record_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("training_records.id"), nullable=False
    )
    previous_certificate_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        # certificates.certificate_request_id → certificate_requests 와 상호 참조라
        # CREATE TABLE 순서를 깨는 순환 — 이쪽 FK 는 ALTER 로 나중에 건다
        ForeignKey(
            "certificates.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_creq_previous_certificate",
        ),
        nullable=True,
    )
    # 소속 결제 주문 — 다건 발급에서 여러 신청이 하나의 주문을 공유한다 (N:1).
    # 레거시 단건 row 는 payment_orders.certificate_request_id 로도 역참조 가능하다
    payment_order_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("payment_orders.id", ondelete="SET NULL"),
        nullable=True,
    )
    # 신청자 — WEB 발급은 회원, 어드민 발급은 신청 주체가 없어 NULL 허용.
    # trainee.user_id 가 연결돼 있으면 어드민 발급분도 채워 WEB 에 노출된다
    requested_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=True
    )
    issue_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="original"
    )
    membership_grade_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("membership_grades.id"), nullable=False
    )
    pricing_rule_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("certificate_pricing_rules.id", ondelete="SET NULL"),
        nullable=True,
    )
    amount_krw: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="KRW")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
