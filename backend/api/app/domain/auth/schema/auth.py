import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class AdminRegisterRequest(BaseModel):
    """초대된 이메일의 최초 가입 — 화이트리스트(pending) 확인 후 계정 생성."""

    email: EmailStr
    password: str
    name: str | None = None


class AdminLoginRequest(BaseModel):
    email: EmailStr
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


class AdminUserUpdate(BaseModel):
    status: str | None = None  # active | disabled


class AllowedEmailCreate(BaseModel):
    email: EmailStr
    note: str | None = None


class AllowedEmailResponse(BaseModel):
    id: uuid.UUID
    email: str
    status: str
    note: str | None
    joined_admin_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MeResponse(BaseModel):
    """관리자·개인회원 공통 — account_type 으로 분기."""

    account_type: str  # admin | user
    id: uuid.UUID
    email: str | None = None
    name: str | None = None
    role: str | None = None
