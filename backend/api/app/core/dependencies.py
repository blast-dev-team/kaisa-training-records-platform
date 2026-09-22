"""공용 FastAPI 의존성 — 인증·권한.

세션 쿠키 두 개로 두 계정 유형을 다룬다 (같은 브라우저 동시 로그인 지원):
- 개인회원: kaisa_session → DB 세션(user_sessions) → User
- 관리자: kaisa_admin_session → DB 세션(admin_sessions, 토큰 adm_ 접두사) → AdminUser

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


def _read_session_token(request: Request, cookie_name: str) -> str | None:
    return request.cookies.get(cookie_name)


def get_client_ip(request: Request) -> str:
    """실제 클라이언트 IP — nginx 가 덮어쓴 X-Real-IP 만 신뢰한다.

    클라이언트가 보낸 X-Forwarded-For 는 위조 가능하므로 절대 읽지 않는다
    (rate limit 우회·IP 감사 로그 오염 방지). nginx 템플릿이 X-Real-IP 를
    $remote_addr 로 세팅하고, XFF 도 클라이언트가 보낸 체인 대신 $remote_addr 로
    덮어쓴다. LB 를 앞에 두게 되면 realip 모듈 설정이 필요하다.
    """
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """개인회원 세션 — 쿠키 → 해시 조회 → 만료 검증. 실패 401."""
    token = _read_session_token(request, settings.SESSION_COOKIE_NAME)
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
    token = _read_session_token(request, settings.ADMIN_SESSION_COOKIE_NAME)
    if not token or not token.startswith(ADMIN_TOKEN_PREFIX):
        raise api_error("UNAUTHORIZED")
    admin_id = await resolve_admin_session(db, token)
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
        await db.execute(
            select(Trainee).where(
                Trainee.user_id == user.id, Trainee.deleted_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    if trainee is None:
        raise api_error("TRAINEE_NOT_LINKED")
    return trainee
