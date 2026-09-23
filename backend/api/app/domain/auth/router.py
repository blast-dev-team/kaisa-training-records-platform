import uuid

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_client_ip, require_admin, require_super
from app.core.session import clear_session_cookie_params, session_cookie_params
from app.domain.auth.model import AdminUser
from app.domain.auth.schema import (
    AdminLoginRequest,
    AdminRegisterRequest,
    AdminUserResponse,
    AdminUserUpdate,
    AllowedEmailCreate,
    AllowedEmailResponse,
    MeResponse,
    PasswordChangeRequest,
)
from app.domain.auth.service import auth_service
from app.domain.identity.schema import (
    PassCompleteRequest,
    PassCompleteResponse,
    PassStartRequest,
    PassStartResponse,
    PassTestLoginRequest,
)
from app.domain.identity.service import identity_service

router = APIRouter(prefix="/auth", tags=["auth"])
admin_user_router = APIRouter(prefix="/admin-users", tags=["admin-users"])
allowed_email_router = APIRouter(
    prefix="/admin-allowed-emails", tags=["admin-allowed-emails"]
)


def _session_token(request: Request, cookie_name: str) -> str | None:
    return request.cookies.get(cookie_name)


@router.post("/register", response_model=AdminUserResponse, status_code=201)
async def register_admin(
    body: AdminRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    admin = await auth_service.register_admin(db, body, get_client_ip(request))
    return admin


@router.post("/login", response_model=AdminUserResponse)
async def login_admin(
    body: AdminLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    ip = get_client_ip(request)
    admin, token = await auth_service.login_admin(
        db, body.email, body.password, ip, request.headers.get("user-agent")
    )
    response.set_cookie(
        **session_cookie_params(token, settings.ADMIN_SESSION_COOKIE_NAME)
    )
    return admin


@router.patch("/password")
async def change_password(
    body: PasswordChangeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    await auth_service.change_own_password(
        db,
        actor,
        body.current_password,
        body.new_password,
        current_token=_session_token(request, settings.ADMIN_SESSION_COOKIE_NAME),
    )
    return {"ok": True}


@router.post("/logout")
async def logout(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
):
    admin_token = _session_token(request, settings.ADMIN_SESSION_COOKIE_NAME)
    user_token = _session_token(request, settings.SESSION_COOKIE_NAME)
    await auth_service.logout_admin_session(db, admin_token)
    await auth_service.logout_user_session(db, user_token)
    # 양쪽 쿠키 모두 만료 — 어떤 앱에서 로그아웃해도 세션이 남지 않게
    response.set_cookie(**clear_session_cookie_params(settings.ADMIN_SESSION_COOKIE_NAME))
    response.set_cookie(**clear_session_cookie_params(settings.SESSION_COOKIE_NAME))
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
async def me(request: Request, db: AsyncSession = Depends(get_db)):
    return await auth_service.me(
        db,
        _session_token(request, settings.ADMIN_SESSION_COOKIE_NAME),
        _session_token(request, settings.SESSION_COOKIE_NAME),
    )


# ── 회원 PASS 본인인증 로그인 (공개) ───────────────────────────────────────────


@router.post("/pass", response_model=PassStartResponse)
async def start_pass(body: PassStartRequest, request: Request):
    return await identity_service.start_pass(body, get_client_ip(request))


@router.post("/pass/complete", response_model=PassCompleteResponse)
async def complete_pass(
    body: PassCompleteRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    result, token = await identity_service.complete_pass(
        db, body.state, get_client_ip(request)
    )
    response.set_cookie(**session_cookie_params(token))
    return result


@router.post("/pass/test-login", response_model=PassCompleteResponse)
async def test_login_pass(
    body: PassTestLoginRequest, response: Response, db: AsyncSession = Depends(get_db)
):
    # 데모용 우회 로그인 — production 에서는 service 가 404 로 숨긴다
    result, token = await identity_service.test_login(db, body)
    response.set_cookie(**session_cookie_params(token))
    return result


@router.post("/pass/super-login", response_model=PassCompleteResponse)
async def super_login_pass(
    body: PassTestLoginRequest, response: Response, db: AsyncSession = Depends(get_db)
):
    """슈퍼 계정 우회 로그인 — 전 회원 이력 조회(미리보기). production 은 404."""
    result, token = await identity_service.super_login(db, body)
    response.set_cookie(**session_cookie_params(token))
    return result


# ── 관리자 계정 관리 (super) ───────────────────────────────────────────────────


@admin_user_router.get("", response_model=list[AdminUserResponse])
async def list_admin_users(
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_super),
):
    return await auth_service.list_admin_users(db)


@admin_user_router.patch("/{admin_id}", response_model=AdminUserResponse)
async def update_admin_user(
    admin_id: uuid.UUID,
    body: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_super),
):
    return await auth_service.update_admin_user(db, admin_id, body, actor)


# ── 화이트리스트 (admin) ───────────────────────────────────────────────────────


@allowed_email_router.get("", response_model=list[AllowedEmailResponse])
async def list_allowed_emails(
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    return await auth_service.list_allowed_emails(db, search=search)


@allowed_email_router.post("", response_model=AllowedEmailResponse, status_code=201)
async def create_allowed_email(
    body: AllowedEmailCreate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    return await auth_service.create_allowed_email(db, body, actor)


@allowed_email_router.delete("/{allowed_email_id}", status_code=204)
async def delete_allowed_email(
    allowed_email_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    await auth_service.delete_allowed_email(db, allowed_email_id, actor)
