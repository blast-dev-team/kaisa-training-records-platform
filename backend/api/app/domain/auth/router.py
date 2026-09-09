import uuid

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import require_admin, require_super
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
)
from app.domain.auth.service import auth_service
from app.domain.identity.schema import (
    PassCompleteRequest,
    PassCompleteResponse,
    PassStartResponse,
)
from app.domain.identity.service import identity_service

router = APIRouter(prefix="/auth", tags=["auth"])
admin_user_router = APIRouter(prefix="/admin-users", tags=["admin-users"])
allowed_email_router = APIRouter(
    prefix="/admin-allowed-emails", tags=["admin-allowed-emails"]
)


def _session_token(request: Request) -> str | None:
    return request.cookies.get(settings.SESSION_COOKIE_NAME)


@router.post("/register", response_model=AdminUserResponse, status_code=201)
async def register_admin(
    body: AdminRegisterRequest, db: AsyncSession = Depends(get_db)
):
    admin = await auth_service.register_admin(db, body)
    return admin


@router.post("/login", response_model=AdminUserResponse)
async def login_admin(
    body: AdminLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    ip = request.client.host if request.client else "unknown"
    admin, token = await auth_service.login_admin(
        db, body.email, body.password, ip, request.headers.get("user-agent")
    )
    response.set_cookie(**session_cookie_params(token))
    return admin


@router.post("/logout")
async def logout(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
):
    token = _session_token(request)
    auth_service.logout(token)
    await auth_service.logout_user_session(db, token)
    response.set_cookie(**clear_session_cookie_params())
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
async def me(request: Request, db: AsyncSession = Depends(get_db)):
    return await auth_service.me(db, _session_token(request))


# ── 회원 PASS 본인인증 로그인 (공개) ───────────────────────────────────────────


@router.post("/pass", response_model=PassStartResponse)
async def start_pass():
    return await identity_service.start_pass()


@router.post("/pass/complete", response_model=PassCompleteResponse)
async def complete_pass(
    body: PassCompleteRequest, response: Response, db: AsyncSession = Depends(get_db)
):
    result, token = await identity_service.complete_pass(db, body.state)
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
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    return await auth_service.list_allowed_emails(db)


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
