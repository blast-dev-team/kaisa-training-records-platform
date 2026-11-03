import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Inquiry(Base):
    """교육생 문의 1건 + 관리자 답변 1개 (답변은 같은 행에 둔다).

    문의자 정보(성명·연락처·감리원증번호·이메일)는 회원·비회원 모두 작성 시점 값으로 남긴다 —
    회원 정보가 나중에 바뀌어도 문의 당시 정보가 보이고, 같은 문의자의 문의를
    (user_id) 또는 (성명 해시 + 연락처 해시)로 묶어 볼 수 있게.
    """

    __tablename__ = "inquiries"
    __table_args__ = (
        Index("ix_inquiries_status_created_at", "status", "created_at"),
        Index("ix_inquiries_user_id", "user_id"),
        Index("ix_inquiries_author_hashes", "author_name_hash", "author_phone_hash"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # open = 답변 대기, answered = 답변 완료
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")

    # 회원 문의만 채운다 — 비회원은 둘 다 NULL
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    trainee_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("trainees.id", ondelete="SET NULL"), nullable=True
    )

    author_name_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    author_name_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    author_phone_encrypted: Mapped[str | None] = mapped_column(Text)
    author_phone_hash: Mapped[str | None] = mapped_column(String(64))
    author_cert_no: Mapped[str | None] = mapped_column(String(100))
    author_email: Mapped[str | None] = mapped_column(String(255))
    # 비회원 조회용 비밀번호 (pbkdf2) — 회원 문의는 NULL
    password_hash: Mapped[str | None] = mapped_column(String(255))

    answer: Mapped[str | None] = mapped_column(Text)
    answered_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
