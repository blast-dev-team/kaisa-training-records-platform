import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    """개인회원 — PASS 본인인증 CI 해시가 유일한 식별자. find-or-create."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    ci_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    # 이름 — Fernet 가역 저장 + HMAC blind index (인증 시점 스냅샷)
    name_encrypted: Mapped[str | None] = mapped_column(Text)
    name_hash: Mapped[str | None] = mapped_column(String(64))
    # PASS 본인인증으로 확정된 생년월일 (YYYYMMDD) — 인증 시점 스냅샷
    birth: Mapped[str | None] = mapped_column(String(8))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
