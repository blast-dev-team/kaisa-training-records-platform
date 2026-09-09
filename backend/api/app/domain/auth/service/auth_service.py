import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.config import settings
from app.core.crypto import hash_ip
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.core.rate_limit import clear_attempts, is_rate_limited, register_attempt
from app.core.security import hash_password, validate_password, verify_password
from app.core.session import (
    ADMIN_TOKEN_PREFIX,
    create_admin_session,
    delete_user_session,
    resolve_admin_session,
    resolve_user_session,
    revoke_admin_session,
)
from app.domain.auth.model import AdminAllowedEmail, AdminUser
from app.domain.auth.repository import auth_repository as repo
from app.domain.auth.schema import (
    AdminRegisterRequest,
    AdminUserUpdate,
    AllowedEmailCreate,
    MeResponse,
)

# ── 관리자 가입·로그인 ─────────────────────────────────────────────────────────


async def register_admin(db: AsyncSession, data: AdminRegisterRequest) -> AdminUser:
    """초대(화이트리스트 pending)된 이메일만 가입 허용. 성공 시 status=joined."""
    if not validate_password(data.password):
        raise api_error("WEAK_PASSWORD")
    if await repo.find_admin_by_email(db, data.email):
        raise api_error("DUPLICATE_EMAIL")
    allowed = await repo.find_allowed_email_by_email(db, data.email)
    if allowed is None or allowed.status != "pending":
        raise api_error("EMAIL_NOT_ALLOWED")

    admin = AdminUser(
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        name=data.name,
    )
    db.add(admin)
    await db.flush()
    allowed.status = "joined"
    allowed.joined_admin_id = admin.id
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="admin_user.registered",
        entity_type="admin_user",
        entity_id=admin.id,
        after={"email": admin.email, "role": admin.role},
    )
    await db.commit()
    await db.refresh(admin)
    return admin


async def login_admin(
    db: AsyncSession, email: str, password: str, ip: str, user_agent: str | None
) -> tuple[AdminUser, str]:
    """검증 → 세션 발급. 실패 5회/5분 초과 시 429. 세션 토큰 반환(Set-Cookie 용)."""
    key = f"login:{email.lower()}:{hash_ip(ip)}"
    if is_rate_limited(
        key, settings.RATE_LIMIT_LOGIN_MAX, settings.RATE_LIMIT_LOGIN_WINDOW
    ):
        raise api_error("TOO_MANY_ATTEMPTS")

    admin = await repo.find_admin_by_email(db, email)
    if admin is None or not verify_password(password, admin.password_hash):
        register_attempt(key, settings.RATE_LIMIT_LOGIN_WINDOW)
        raise api_error("INVALID_CREDENTIALS")
    if admin.status != "active":
        raise api_error("ACCOUNT_DISABLED")

    clear_attempts(key)
    admin.last_login_at = now_kst()
    await db.commit()
    await db.refresh(admin)
    token = create_admin_session(admin.id)
    return admin, token


def logout(token: str | None) -> None:
    """관리자 세션 폐기(메모리). 개인회원 세션은 호출자가 DB 삭제."""
    if token and token.startswith(ADMIN_TOKEN_PREFIX):
        revoke_admin_session(token)


async def logout_user_session(db: AsyncSession, token: str | None) -> None:
    if token and not token.startswith(ADMIN_TOKEN_PREFIX):
        await delete_user_session(db, token)


async def me(db: AsyncSession, token: str | None) -> MeResponse:
    """쿠키 토큰으로 계정 식별 — 관리자/개인회원 공통."""
    if not token:
        raise api_error("UNAUTHORIZED")
    if token.startswith(ADMIN_TOKEN_PREFIX):
        admin_id = resolve_admin_session(token)
        admin = await db.get(AdminUser, admin_id) if admin_id else None
        if admin is None or admin.status != "active":
            raise api_error("SESSION_EXPIRED")
        return MeResponse(
            account_type="admin",
            id=admin.id,
            email=admin.email,
            name=admin.name,
            role=admin.role,
        )
    user = await resolve_user_session(db, token)
    if user is None:
        raise api_error("SESSION_EXPIRED")
    return MeResponse(account_type="user", id=user.id, name=user.name)


# ── 관리자 계정 관리 (super) ───────────────────────────────────────────────────


async def list_admin_users(db: AsyncSession) -> list[AdminUser]:
    return await repo.list_admin_users(db)


async def update_admin_user(
    db: AsyncSession, admin_id: uuid.UUID, data: AdminUserUpdate, actor: AdminUser
) -> AdminUser:
    admin = await db.get(AdminUser, admin_id)
    if admin is None:
        raise api_error("NOT_FOUND")
    if data.status is not None:
        if data.status not in ("active", "disabled"):
            raise api_error(
                "VALIDATION_ERROR",
                status_code=400,
                message="status 는 active 또는 disabled 여야 해요",
            )
        # 자기 계정 비활성화 방지 — 마지막 super 잠금 방지
        if data.status == "disabled" and admin.id == actor.id:
            raise api_error(
                "VALIDATION_ERROR",
                status_code=400,
                message="자신의 계정은 비활성화할 수 없어요",
            )
        before = {"status": admin.status}
        admin.status = data.status
        record_audit(
            db,
            actor_admin_id=actor.id,
            action="admin_user.status_changed",
            entity_type="admin_user",
            entity_id=admin.id,
            before=before,
            after={"status": admin.status},
        )
    await db.commit()
    await db.refresh(admin)
    return admin


# ── 화이트리스트 (admin) ───────────────────────────────────────────────────────


async def list_allowed_emails(db: AsyncSession) -> list[AdminAllowedEmail]:
    return await repo.list_allowed_emails(db)


async def create_allowed_email(
    db: AsyncSession, data: AllowedEmailCreate, actor: AdminUser
) -> AdminAllowedEmail:
    if await repo.find_allowed_email_by_email(db, data.email):
        raise api_error("DUPLICATE_EMAIL")
    row = AdminAllowedEmail(
        email=data.email.lower(),
        note=data.note,
        created_by=actor.id,
    )
    db.add(row)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="allowed_email.created",
        entity_type="admin_allowed_email",
        entity_id=row.id,
        after={"email": row.email},
    )
    await db.commit()
    await db.refresh(row)
    return row


async def delete_allowed_email(
    db: AsyncSession, allowed_email_id: uuid.UUID, actor: AdminUser
) -> None:
    """화이트리스트 제거 — 기존 가입자(admin_users)는 유지. 차단 수단 아님."""
    row = await repo.find_allowed_email_by_id(db, allowed_email_id)
    if row is None:
        raise api_error("NOT_FOUND")
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="allowed_email.deleted",
        entity_type="admin_allowed_email",
        entity_id=row.id,
        before={"email": row.email, "status": row.status},
    )
    await db.delete(row)
    await db.commit()
