import hashlib
import hmac
import secrets
import uuid
from datetime import timedelta

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.config import settings
from app.core.crypto import decrypt_field, hash_ip
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.core.rate_limit import clear_attempts, is_rate_limited, register_attempt
from app.core.security import hash_password, validate_password, verify_password
from app.core.session import (
    ADMIN_TOKEN_PREFIX,
    create_admin_session,
    delete_user_session,
    hash_token,
    resolve_admin_session,
    resolve_user_session,
    revoke_admin_session,
)
from app.domain.auth.model import AdminAllowedEmail, AdminSession, AdminUser
from app.domain.auth.repository import auth_repository as repo
from app.domain.auth.schema import (
    AdminRegisterRequest,
    AdminUserUpdate,
    AllowedEmailCreate,
    MeResponse,
)

# ── 관리자 가입·로그인 ─────────────────────────────────────────────────────────

INVITE_TTL_DAYS = 7
# 혼동되는 글자(0/O, 1/I/L) 제외 — 전화·메신저로 불러줘도 틀리지 않게
_INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _new_invite_code() -> str:
    """`XXXX-XXXX-XXXX` (31^12 ≈ 7.9e17) — 가입 시도는 IP 당 rate limit 이 걸린다."""
    chars = "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(12))
    return f"{chars[:4]}-{chars[4:8]}-{chars[8:]}"


def _hash_invite_code(code: str) -> str:
    normalized = code.strip().upper().replace("-", "").replace(" ", "")
    return hashlib.sha256(normalized.encode()).hexdigest()


def _issue_invite(row: AdminAllowedEmail) -> str:
    code = _new_invite_code()
    row.invite_code_hash = _hash_invite_code(code)
    row.invite_expires_at = now_kst() + timedelta(days=INVITE_TTL_DAYS)
    return code


async def register_admin(
    db: AsyncSession, data: AdminRegisterRequest, ip: str
) -> AdminUser:
    """초대(화이트리스트 pending)된 이메일만 가입 허용. 성공 시 status=joined.

    무인증 엔드포인트 — 시도를 IP 단위로 제한해 화이트리스트 이메일 열거를 막는다
    (DUPLICATE_EMAIL / EMAIL_NOT_ALLOWED 응답 차이로 존재 여부를 추리할 수 있음).
    """
    key = f"register:{hash_ip(ip)}"
    if is_rate_limited(
        key, settings.RATE_LIMIT_REGISTER_MAX, settings.RATE_LIMIT_REGISTER_WINDOW
    ):
        raise api_error("TOO_MANY_ATTEMPTS")
    register_attempt(key, settings.RATE_LIMIT_REGISTER_WINDOW)
    if not validate_password(data.password):
        raise api_error("WEAK_PASSWORD")
    # 초대 코드 = 이메일 소유 증명. 초대 없음·불일치·만료는 같은 응답으로 돌려
    # 화이트리스트에 어떤 이메일이 있는지 추리할 수 없게 한다
    allowed = await repo.find_allowed_email_by_email(db, data.email)
    if (
        allowed is None
        or allowed.status != "pending"
        or allowed.invite_code_hash is None
        or allowed.invite_expires_at is None
        or allowed.invite_expires_at < now_kst()
        or not hmac.compare_digest(
            allowed.invite_code_hash, _hash_invite_code(data.invite_code)
        )
    ):
        raise api_error("INVITE_INVALID")
    if await repo.find_admin_by_email(db, data.email):
        raise api_error("DUPLICATE_EMAIL")

    admin = AdminUser(
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        name=data.name,
    )
    db.add(admin)
    await db.flush()
    allowed.status = "joined"
    allowed.joined_admin_id = admin.id
    allowed.invite_code_hash = None  # 1회용
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
    token = await create_admin_session(db, admin.id, user_agent)
    return admin, token


async def change_own_password(
    db: AsyncSession,
    actor: AdminUser,
    current_password: str,
    new_password: str,
    current_token: str | None = None,
) -> None:
    """본인 비밀번호 변경 — 현재 비밀번호 검증 후 교체. 감사로그에 평문·해시 미기록.

    비밀번호가 바뀌었으면 도난 가능성도 바뀐 것 — 다른 기기의 기존 세션을 전부 폐기하고
    현재 세션(요청 주체)만 살려둔다.
    """
    if not verify_password(current_password, actor.password_hash):
        raise api_error(
            "INVALID_CREDENTIALS",
            message="현재 비밀번호가 일치하지 않아요",
        )
    if not validate_password(new_password):
        raise api_error("WEAK_PASSWORD")
    actor.password_hash = hash_password(new_password)
    await db.execute(
        delete(AdminSession).where(
            AdminSession.admin_id == actor.id,
            AdminSession.token_hash != hash_token(current_token or ""),
        )
    )
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="admin_user.password_changed",
        entity_type="admin_user",
        entity_id=actor.id,
    )
    await db.commit()
    await db.refresh(actor)


async def logout_admin_session(db: AsyncSession, token: str | None) -> None:
    """관리자 세션 폐기(DB). 개인회원 세션은 logout_user_session."""
    if token and token.startswith(ADMIN_TOKEN_PREFIX):
        await revoke_admin_session(db, token)


async def logout_user_session(db: AsyncSession, token: str | None) -> None:
    if token and not token.startswith(ADMIN_TOKEN_PREFIX):
        await delete_user_session(db, token)


async def me(db: AsyncSession, admin_token: str | None, user_token: str | None) -> MeResponse:
    """쿠키 토큰으로 계정 식별 — 관리자/개인회원 쿠키가 분리돼 둘 다 받는다."""
    if admin_token and admin_token.startswith(ADMIN_TOKEN_PREFIX):
        admin_id = await resolve_admin_session(db, admin_token)
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
    if not user_token:
        raise api_error("UNAUTHORIZED")
    user = await resolve_user_session(db, user_token)
    if user is None:
        raise api_error("SESSION_EXPIRED")
    return MeResponse(
        account_type="user", id=user.id, name=decrypt_field(user.name_encrypted)
    )


# ── 관리자 계정 관리 (super) ───────────────────────────────────────────────────


async def list_admin_users(db: AsyncSession) -> list[AdminUser]:
    return await repo.list_admin_users(db)


async def update_admin_user(
    db: AsyncSession, admin_id: uuid.UUID, data: AdminUserUpdate, actor: AdminUser
) -> AdminUser:
    admin = await db.get(AdminUser, admin_id)
    if admin is None:
        raise api_error("NOT_FOUND")
    # 감사 로그용 원본 — 할당이 먼저 일어나므로 변경 전 값은 여기서 캡처
    orig_name = admin.name
    orig_role = admin.role
    if data.name is not None:
        name = data.name.strip()
        if not name or len(name) > 100:
            raise api_error(
                "VALIDATION_ERROR",
                status_code=400,
                message="이름은 1~100자로 입력해 주세요",
            )
        admin.name = name
    if data.role is not None:
        if data.role not in ("super", "staff"):
            raise api_error(
                "VALIDATION_ERROR",
                status_code=400,
                message="role 은 super 또는 staff 여야 해요",
            )
        # 자기 역할 변경 금지 — 마지막 super 가 스스로 강등되면 화면 잠김
        if data.role != admin.role and admin.id == actor.id:
            raise api_error(
                "VALIDATION_ERROR",
                status_code=400,
                message="자신의 역할은 변경할 수 없어요",
            )
        admin.role = data.role
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
    if data.password is not None:
        if not validate_password(data.password):
            raise api_error("WEAK_PASSWORD")
        # 값 자체는 절대 기록하지 않는다 — 발생 사실만 남긴다
        admin.password_hash = hash_password(data.password)
        # 초기화 = 계정이 도난당했을 가능성 대응 — 대상의 모든 세션 강제 로그아웃
        await db.execute(
            delete(AdminSession).where(AdminSession.admin_id == admin.id)
        )
        record_audit(
            db,
            actor_admin_id=actor.id,
            action="admin_user.password_reset",
            entity_type="admin_user",
            entity_id=admin.id,
        )
    # 이름·역할 변경 감사 — 바뀐 필드만 before/after 에 기록
    before_profile: dict = {}
    after_profile: dict = {}
    if admin.name != orig_name:
        before_profile["name"] = orig_name
        after_profile["name"] = admin.name
    if admin.role != orig_role:
        before_profile["role"] = orig_role
        after_profile["role"] = admin.role
    if before_profile:
        record_audit(
            db,
            actor_admin_id=actor.id,
            action="admin_user.updated",
            entity_type="admin_user",
            entity_id=admin.id,
            before=before_profile,
            after=after_profile,
        )
    await db.commit()
    await db.refresh(admin)
    return admin


# ── 화이트리스트 (admin) ───────────────────────────────────────────────────────


async def list_allowed_emails(
    db: AsyncSession, search: str | None = None
) -> list[AdminAllowedEmail]:
    return await repo.list_allowed_emails(db, search=search)


async def create_allowed_email(
    db: AsyncSession, data: AllowedEmailCreate, actor: AdminUser
) -> tuple[AdminAllowedEmail, str]:
    """초대 — 화이트리스트 등록 + 1회용 가입 코드 발급. 평문 코드는 반환값으로만 나간다."""
    if await repo.find_allowed_email_by_email(db, data.email):
        raise api_error("DUPLICATE_EMAIL")
    row = AdminAllowedEmail(
        email=data.email.lower(),
        note=data.note,
        created_by=actor.id,
    )
    code = _issue_invite(row)
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
    return row, code


async def reissue_invite_code(
    db: AsyncSession, allowed_email_id: uuid.UUID, actor: AdminUser
) -> tuple[AdminAllowedEmail, str]:
    """초대 코드 재발급 — 분실·만료 대응. 이전 코드는 즉시 무효가 된다."""
    row = await repo.find_allowed_email_by_id(db, allowed_email_id)
    if row is None:
        raise api_error("NOT_FOUND")
    if row.status != "pending":
        raise api_error(
            "INVALID_STATUS_TRANSITION", message="이미 가입한 이메일이에요"
        )
    code = _issue_invite(row)
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="allowed_email.invite_reissued",
        entity_type="admin_allowed_email",
        entity_id=row.id,
        after={"email": row.email},
    )
    await db.commit()
    await db.refresh(row)
    return row, code


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
