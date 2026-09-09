"""세션 — 개인회원은 DB(user_sessions), 관리자는 in-memory.

토큰 정책 (계획서 결정 #2):
- opaque 랜덤 256-bit (`secrets.token_urlsafe(32)`) — 서명키 없음
- 쿠키에는 원본 토큰, 저장소에는 SHA-256 해시만 보관
- 고정 TTL 24h (슬라이딩 연장 없음), 로그아웃 = 세션 삭제

관리자 세션이 in-memory 인 이유: user_sessions.user_id 가 users(개인회원)
FK 라 admin_users 행을 담을 수 없다. 관리자는 소수 + workers=1 전제
(배포 Dockerfile `--workers 1`, gongcar 와 동일)라 프로세스 메모리로
충분하다. 재시작 시 관리자 전원 재로그인 — 운영 지장 미미.
"""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.kst import now_kst
from app.domain.auth.model import UserSession
from app.domain.user.model import User

# 관리자 토큰 접두사 — 조회 경로(DB vs 메모리) 분기용
ADMIN_TOKEN_PREFIX = "adm_"


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _expiry() -> datetime:
    return now_kst() + timedelta(hours=settings.SESSION_TTL_HOURS)


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
            expires_at=_expiry(),
        )
    )
    await db.commit()
    return token


async def resolve_user_session(db: AsyncSession, token: str) -> User | None:
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
    return row.user


async def delete_user_session(db: AsyncSession, token: str) -> None:
    await db.execute(
        delete(UserSession).where(UserSession.token_hash == hash_token(token))
    )
    await db.commit()


# ── 관리자 (in-memory 세션 — workers=1 전제) ──────────────────────────────────


@dataclass
class _AdminSession:
    admin_id: uuid.UUID
    expires_at: datetime


_admin_sessions: dict[str, _AdminSession] = {}


def _prune_admin_sessions() -> None:
    now = now_kst()
    expired = [h for h, s in _admin_sessions.items() if s.expires_at <= now]
    for h in expired:
        _admin_sessions.pop(h, None)


def create_admin_session(admin_id: uuid.UUID) -> str:
    token = ADMIN_TOKEN_PREFIX + generate_token()
    _prune_admin_sessions()
    _admin_sessions[hash_token(token)] = _AdminSession(
        admin_id=admin_id, expires_at=_expiry()
    )
    return token


def resolve_admin_session(token: str) -> uuid.UUID | None:
    session = _admin_sessions.get(hash_token(token))
    if session is None:
        return None
    if session.expires_at <= now_kst():
        _admin_sessions.pop(hash_token(token), None)
        return None
    return session.admin_id


def revoke_admin_session(token: str) -> None:
    _admin_sessions.pop(hash_token(token), None)


# ── 쿠키 헬퍼 ──────────────────────────────────────────────────────────────────


def session_cookie_params(token: str) -> dict:
    """Set-Cookie 공통 파라미터 — httponly, samesite=lax, local 외 secure."""
    return {
        "key": settings.SESSION_COOKIE_NAME,
        "value": token,
        "httponly": True,
        "samesite": "lax",
        "secure": settings.ENVIRONMENT != "local",
        "path": "/",
        "max_age": settings.SESSION_TTL_HOURS * 3600,
    }


def clear_session_cookie_params() -> dict:
    return {
        "key": settings.SESSION_COOKIE_NAME,
        "value": "",
        "httponly": True,
        "samesite": "lax",
        "secure": settings.ENVIRONMENT != "local",
        "path": "/",
        "max_age": 0,
    }
