"""공용 FastAPI 의존성 — 인증·권한.

세션 쿠키(kaisa_session) 하나로 두 계정 유형을 다룬다:
- 개인회원: DB 세션(user_sessions) → User
- 관리자: in-memory 세션(토큰 adm_ 접두사) → AdminUser

회원 쿼리는 항상 get_current_trainee 로 얻은 trainee 로 scope 한다 —
클라이언트가 보낸 trainee_id 는 절대 신뢰하지 않는다.
"""

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.error_codes import api_error
from app.core.session import (
    ADMIN_TOKEN_PREFIX,
    resolve_admin_session,
    resolve_user_session,
)
from app.domain.auth.model import AdminUser
from app.domain.trainee.model import Trainee
from app.domain.user.model import User

__all__ = [
    "get_current_trainee",
    "get_current_user",
    "get_db",
    "require_admin",
    "require_super",
]


def _read_session_token(request: Request) -> str | None:
    return request.cookies.get(settings.SESSION_COOKIE_NAME)


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """개인회원 세션 — 쿠키 → 해시 조회 → 만료 검증. 실패 401."""
    token = _read_session_token(request)
    if not token or token.startswith(ADMIN_TOKEN_PREFIX):
        raise api_error("UNAUTHORIZED")
    user = await resolve_user_session(db, token)
    if user is None:
        raise api_error("SESSION_EXPIRED")
    return user


async def require_admin(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminUser:
    """관리자 세션 — disabled 계정은 매 요청 즉시 차단."""
    token = _read_session_token(request)
    if not token or not token.startswith(ADMIN_TOKEN_PREFIX):
        raise api_error("UNAUTHORIZED")
    admin_id = resolve_admin_session(token)
    if admin_id is None:
        raise api_error("SESSION_EXPIRED")
    admin = await db.get(AdminUser, admin_id)
    if admin is None:
        raise api_error("UNAUTHORIZED")
    if admin.status != "active":
        raise api_error("ACCOUNT_DISABLED")
    return admin


async def require_super(admin: AdminUser = Depends(require_admin)) -> AdminUser:
    """super 역할 전용 엔드포인트 (admin 계정 관리 등)."""
    if admin.role != "super":
        raise api_error("FORBIDDEN")
    return admin


async def get_current_trainee(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Trainee:
    """user → trainee 연결 조회. 연결 없으면 403 TRAINEE_NOT_LINKED."""
    trainee = (
        await db.execute(select(Trainee).where(Trainee.user_id == user.id))
    ).scalar_one_or_none()
    if trainee is None:
        raise api_error("TRAINEE_NOT_LINKED")
    return trainee
