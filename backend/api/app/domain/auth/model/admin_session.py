import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.domain.auth.model.admin_user import AdminUser


class AdminSession(Base):
    """관리자 세션 — 개인회원(user_sessions)과 동일한 DB 저장 방식.

    과거엔 in-memory(worker 프로세스 dict)였는데, BE 재배포마다 관리자 전원이
    로그아웃돼 staging 운영이 번거로워 DB 로 옮겼다 (2026-09-16).
    토큰 정책은 개인회원과 동일 — opaque 토큰, 저장은 SHA-256 해시뿐.
    """

    __tablename__ = "admin_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    admin_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("admin_users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    user_agent: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    admin: Mapped["AdminUser"] = relationship("AdminUser", lazy="joined")
