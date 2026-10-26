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
    AllowedEmailInviteResponse,
    AllowedEmailResponse,
    MeResponse,
    PasswordChangeRequest,
)
from app.domain.auth.service import auth_service
from app.domain.identity.schema import (
    PassCompleteRequest,
    PassCompleteResponse,
    PassKaisaLoginRequest,
    PassStartRequest,
    PassStartResponse,
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


@router.post("/pass/logout")
async def logout_pass(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
):
    """회원 "인증 해제" — 회원 세션만 끊는다 (같은 브라우저의 관리자 세션은 유지).

    `/auth/logout` 은 양쪽 쿠키를 모두 지워, 회원 포털에서 해제하면 어드민까지 로그아웃된다.
    만료된 세션이어도 200 — 해제는 항상 성공해야 한다.
    """
    await auth_service.logout_user_session(
        db, _session_token(request, settings.SESSION_COOKIE_NAME)
    )
    response.set_cookie(**clear_session_cookie_params(settings.SESSION_COOKIE_NAME))
    return {"ok": True}


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


@router.post("/pass/kaisa-login", response_model=PassCompleteResponse)
async def kaisa_login_pass(
    body: PassKaisaLoginRequest, response: Response, db: AsyncSession = Depends(get_db)
):
    """KAISA 계정 우회 로그인 — 성명 KAISA + 지정 생년월일·휴대전화, 본인 이력 발급 가능. 전 환경."""
    result, token = await identity_service.kaisa_login(db, body)
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


# ── 화이트리스트 (super) — 관리자 초대는 총관리자만 ───────────────────────────────────────────────────────


@allowed_email_router.get("", response_model=list[AllowedEmailResponse])
async def list_allowed_emails(
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_super),
):
    return await auth_service.list_allowed_emails(db, search=search)


# 초대·삭제·코드 재발급은 super 전용 — staff 계정 하나가 탈취돼도 새 관리자를 만들 수 없게


def _invite_response(row, code: str) -> AllowedEmailInviteResponse:
    return AllowedEmailInviteResponse(
        **AllowedEmailResponse.model_validate(row).model_dump(), invite_code=code
    )


@allowed_email_router.post(
    "", response_model=AllowedEmailInviteResponse, status_code=201
)
async def create_allowed_email(
    body: AllowedEmailCreate,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_super),
):
    row, code = await auth_service.create_allowed_email(db, body, actor)
    return _invite_response(row, code)


@allowed_email_router.post(
    "/{allowed_email_id}/invite-code", response_model=AllowedEmailInviteResponse
)
async def reissue_invite_code(
    allowed_email_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_super),
):
    row, code = await auth_service.reissue_invite_code(db, allowed_email_id, actor)
    return _invite_response(row, code)


@allowed_email_router.delete("/{allowed_email_id}", status_code=204)
async def delete_allowed_email(
    allowed_email_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_super),
):
    await auth_service.delete_allowed_email(db, allowed_email_id, actor)
