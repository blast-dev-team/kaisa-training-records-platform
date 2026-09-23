import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.domain.trainee.model.membership_grade import MembershipGrade
    from app.domain.user.model.user import User


class Trainee(Base):
    """교육생 — CI 는 users.ci_hash 단일 소스. 이관 시 CI 보유분은 user_id 로 미리 연결."""

    __tablename__ = "trainees"
    __table_args__ = (
        Index("ix_trainees_name_hash", "name_hash"),
        Index("ix_trainees_membership_grade_id", "membership_grade_id"),
        Index("ix_trainees_review_status", "review_status"),
        Index("ix_trainees_grade_expires_at", "grade_expires_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    trainee_no: Mapped[str | None] = mapped_column(String(100), unique=True)
    # 감리원증번호 (구 시스템 감리원추가 E열, 예: 정보시스템감리협회 제1361호)
    cert_no: Mapped[str | None] = mapped_column(String(100))
    # 감리원 등급 (감리원 / 수석감리원) — 확인서 표기용. 회원등급(결제 단가)과 별개
    supervisor_grade: Mapped[str | None] = mapped_column(String(50))
    # 감리원증 발급일자 — 엑셀 일괄 등록에서 받는 참조 정보
    cert_issued_date: Mapped[date | None] = mapped_column(Date)
    # 이름 — Fernet 가역 저장 + HMAC blind index (정확히-일치 검색). 부분 검색 불가
    name_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    name_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    birth_date: Mapped[date | None] = mapped_column(Date)
    phone_encrypted: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(String(255))
    membership_grade_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("membership_grades.id", ondelete="SET NULL"), nullable=True
    )
    # 연간 등급 만료일 — 만료일 당일까지 유효, 다음날(KST)부터 일반으로 자동 전환
    grade_expires_at: Mapped[date | None] = mapped_column(Date)
    review_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="unverified"
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    memo: Mapped[str | None] = mapped_column(Text)

    # 소프트딜리트 — 이력(확인서·결제) FK 보존을 위해 row 는 남기고 조회만 숨김
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

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
