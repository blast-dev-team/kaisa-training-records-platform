import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class AdminRegisterRequest(BaseModel):
    """초대된 이메일의 최초 가입 — 화이트리스트(pending) 확인 후 계정 생성."""

    email: EmailStr
    password: str
    name: str | None = None
    # super 가 초대할 때 발급한 1회용 코드 — 이메일 소유 검증을 대신한다
    invite_code: str


class AdminLoginRequest(BaseModel):
    # EmailStr 미적용 — 형식이 틀려도 422 대신 INVALID_CREDENTIALS 로 같은 응답을 준다
    email: str
    password: str


class AdminUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str | None
    role: str
    status: str
    last_login_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PasswordChangeRequest(BaseModel):
    """본인 비밀번호 변경 — 현재 비밀번호 확인 필수."""

    current_password: str
    new_password: str


class AdminUserUpdate(BaseModel):
    status: str | None = None  # active | disabled
    name: str | None = None
    role: str | None = None  # super | staff
    password: str | None = None  # super 리셋 — 있으면 해시만 갱신, 감사로그에 값 미기록


class AllowedEmailCreate(BaseModel):
    email: EmailStr
    note: str | None = None


class AllowedEmailResponse(BaseModel):
    id: uuid.UUID
    email: str
    status: str
    note: str | None
    joined_admin_id: uuid.UUID | None
    invite_expires_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AllowedEmailInviteResponse(AllowedEmailResponse):
    """초대·재발급 응답 — 평문 코드는 이때 한 번만 내려간다(DB 에는 해시만)."""

    invite_code: str


class MeResponse(BaseModel):
    """관리자·개인회원 공통 — account_type 으로 분기."""

    account_type: str  # admin | user
    id: uuid.UUID
    email: str | None = None
    name: str | None = None
    role: str | None = None
