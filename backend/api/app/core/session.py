"""세션 — 개인회원(user_sessions)·관리자(admin_sessions) 모두 DB 저장.

토큰 정책 (계획서 결정 #2):
- opaque 랜덤 256-bit (`secrets.token_urlsafe(32)`) — 서명키 없음
- 쿠키에는 원본 토큰, 저장소에는 SHA-256 해시만 보관
- 관리자 TTL 24h / 개인회원 TTL 10분 (슬라이딩 연장 없음), 로그아웃 = 행 삭제

관리자 세션도 DB 에 두는 이유: 과거 in-memory 였는데 BE 재배포(compose up
--build)마다 관리자 전원이 로그아웃됐다 (2026-09-16). workers=1 전제라
메모리로 충분하다는 판단이었지만 배포 잦은 staging 에서 체감 컸다.

쿠키는 web(개인회원, kaisa_session)과 admin(kaisa_admin_session)으로
이름을 분리한다 — 같은 브라우저에서 양쪽 동시 로그인 지원.
"""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.kst import now_kst
from app.domain.auth.model import AdminSession, UserSession
from app.domain.user.model import User

# 관리자 토큰 접두사 — 관리자/개인회원 조회 경로 분기용
ADMIN_TOKEN_PREFIX = "adm_"


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _expiry() -> datetime:
    return now_kst() + timedelta(hours=settings.SESSION_TTL_HOURS)


def _user_expiry() -> datetime:
    """개인회원 세션 만료 — 관리자(24h)와 별도 짧은 TTL."""
    return now_kst() + timedelta(minutes=settings.USER_SESSION_TTL_MINUTES)


# ── 개인회원 (DB 세션) ─────────────────────────────────────────────────────────


async def create_user_session(
    db: AsyncSession, user_id: uuid.UUID, user_agent: str | None
) -> str:
    token = generate_token()
    db.add(
        UserSession(
            user_id=user_id,
            token_hash=hash_token(token),
            user_agent=user_agent,
            expires_at=_user_expiry(),
        )
    )
    await db.commit()
    return token


async def _find_live_user_session(db: AsyncSession, token: str) -> UserSession | None:
    """해시 조회 → 만료 검증. 만료된 세션은 행을 지우고 None."""
    row = (
        await db.execute(
            select(UserSession).where(UserSession.token_hash == hash_token(token))
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    if row.expires_at <= now_kst():
        await db.delete(row)
        await db.commit()
        return None
    return row


async def resolve_user_session(db: AsyncSession, token: str) -> User | None:
    row = await _find_live_user_session(db, token)
    return row.user if row else None


async def resolve_user_session_expiry(db: AsyncSession, token: str) -> datetime | None:
    """세션 만료 시각 — FE 새로고침 복구(잔여 시간 카운트다운)용."""
    row = await _find_live_user_session(db, token)
    return row.expires_at if row else None


async def extend_user_session(db: AsyncSession, token: str) -> datetime | None:
    """세션 연장 — 유효 세션이면 expires_at 을 now + TTL 로 갱신하고 새 만료 시각 반환.

    무효(없음·만료)면 None. 연장은 고정 TTL 리셋(슬라이딩)이라 쿠키 갱신 불필요 —
    쿠키 max_age 가 DB TTL 보다 길다.
    """
    row = await _find_live_user_session(db, token)
    if row is None:
        return None
    row.expires_at = _user_expiry()
    await db.commit()
    return row.expires_at


async def delete_user_session(db: AsyncSession, token: str) -> None:
    await db.execute(
        delete(UserSession).where(UserSession.token_hash == hash_token(token))
    )
    await db.commit()


# ── 관리자 (DB 세션) ───────────────────────────────────────────────────────────


async def create_admin_session(
    db: AsyncSession, admin_id: uuid.UUID, user_agent: str | None
) -> str:
    token = ADMIN_TOKEN_PREFIX + generate_token()
    # 만료 행 청소 — 생성 빈도가 낮아 여기서 같이 돌린다
    await db.execute(delete(AdminSession).where(AdminSession.expires_at <= now_kst()))
    db.add(
        AdminSession(
            admin_id=admin_id,
            token_hash=hash_token(token),
            user_agent=user_agent,
            expires_at=_expiry(),
        )
    )
    await db.commit()
    return token


async def resolve_admin_session(db: AsyncSession, token: str) -> uuid.UUID | None:
    """해시 조회 → 만료 검증. 만료된 세션은 행을 지우고 None."""
    row = (
        await db.execute(
            select(AdminSession).where(AdminSession.token_hash == hash_token(token))
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    if row.expires_at <= now_kst():
        await db.delete(row)
        await db.commit()
        return None
    return row.admin_id


async def revoke_admin_session(db: AsyncSession, token: str) -> None:
    await db.execute(
        delete(AdminSession).where(AdminSession.token_hash == hash_token(token))
    )
    await db.commit()


# ── 쿠키 헬퍼 ──────────────────────────────────────────────────────────────────


def session_cookie_params(token: str, cookie_name: str | None = None) -> dict:
    """Set-Cookie 공통 파라미터 — httponly, samesite=lax, local 외 secure.

    cookie_name 미지정 시 개인회원(web) 쿠키. 관리자는 ADMIN_SESSION_COOKIE_NAME.
    """
    return {
        "key": cookie_name or settings.SESSION_COOKIE_NAME,
        "value": token,
        "httponly": True,
        "samesite": "lax",
        "secure": settings.ENVIRONMENT != "local",
        "path": "/",
        "max_age": settings.SESSION_TTL_HOURS * 3600,
    }


def clear_session_cookie_params(cookie_name: str | None = None) -> dict:
    return {
        "key": cookie_name or settings.SESSION_COOKIE_NAME,
        "value": "",
        "httponly": True,
        "samesite": "lax",
        "secure": settings.ENVIRONMENT != "local",
        "path": "/",
        "max_age": 0,
    }
