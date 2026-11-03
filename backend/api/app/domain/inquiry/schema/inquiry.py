import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.crypto import normalize_phone

# 문의 유형 — 화면 라벨은 FE 가 가진다
# training_record 교육내역(누락·정정) · certificate 확인서 발급 · payment 결제·환불
# auth 본인인증·로그인 · verification 진위확인 · etc 기타
InquiryCategory = Literal[
    "training_record", "certificate", "payment", "auth", "verification", "etc"
]
InquiryStatus = Literal["open", "answered"]


class _InquiryBody(BaseModel):
    category: InquiryCategory
    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=2000)

    @field_validator("title", "content")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("내용을 입력해 주세요")
        return v


class MemberInquiryCreate(_InquiryBody):
    """회원 문의 — 문의자 정보는 서버가 회원 정보에서 채운다."""


class MemberInquiryAuthor(BaseModel):
    """회원 문의 작성 화면에 자동으로 채워 보여 줄 문의자 정보 — 저장되는 값과 같다."""

    name: str
    cert_no: str | None
    phone_masked: str | None


class GuestInquiryCreate(_InquiryBody):
    """비회원 문의 — 문의자 정보와 조회용 비밀번호를 직접 입력한다."""

    name: str = Field(min_length=1, max_length=50)
    phone: str = Field(min_length=9, max_length=20)
    cert_no: str | None = Field(default=None, max_length=100)
    email: EmailStr | None = None
    # ASCII 숫자 6~20자리 (\d 는 전각·아랍 숫자도 받는다). 4자리는 경우의 수가 1만이라 대입에 약하다
    password: str = Field(pattern=r"^[0-9]{6,20}$")
    privacy_agreed: bool
    # 봇 차단용 숨은 칸 — 사람은 비워 둔다
    website: str | None = None

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("성명을 입력해 주세요")
        return v

    @field_validator("phone")
    @classmethod
    def _phone_digits(cls, v: str) -> str:
        digits = normalize_phone(v)
        if not 9 <= len(digits) <= 11:
            raise ValueError("연락처를 확인해 주세요")
        return digits

    @field_validator("cert_no", "email", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v.strip() if isinstance(v, str) else v


class GuestInquiryLookup(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    phone: str = Field(min_length=9, max_length=20)
    password: str = Field(min_length=1, max_length=20)


class InquiryCreatedResponse(BaseModel):
    id: uuid.UUID
    created_at: datetime


class InquiryResponse(BaseModel):
    """교육생에게 보여 주는 문의 — 문의자 본인 것만 내려간다."""

    id: uuid.UUID
    category: str
    title: str
    content: str
    status: str
    answer: str | None
    answered_at: datetime | None
    created_at: datetime

    @classmethod
    def from_orm(cls, inquiry) -> "InquiryResponse":
        return cls(
            id=inquiry.id,
            category=inquiry.category,
            title=inquiry.title,
            content=inquiry.content,
            status=inquiry.status,
            answer=inquiry.answer,
            answered_at=inquiry.answered_at,
            created_at=inquiry.created_at,
        )


class InquiryAdminListItem(BaseModel):
    id: uuid.UUID
    category: str
    title: str
    status: str
    author_name: str
    is_member: bool
    answered_by_name: str | None
    answered_at: datetime | None
    created_at: datetime


class InquiryAdminDetail(InquiryAdminListItem):
    content: str
    answer: str | None
    author_phone: str | None
    author_cert_no: str | None
    author_email: str | None
    trainee_id: uuid.UUID | None
    trainee_no: str | None
    updated_at: datetime
    # 같은 문의자(회원 계정 일치 또는 성명+연락처 일치)의 다른 문의 — 최신순
    history: list["InquiryHistoryItem"]


class InquiryHistoryItem(InquiryAdminListItem):
    content: str
    answer: str | None
    # account = 같은 회원 계정(본인 확인됨) · name_phone = 성명+연락처만 일치(비회원 정보는 본인확인 안 됨)
    matched_by: Literal["account", "name_phone"]


class InquiryAnswerRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=5000)

    @field_validator("answer")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("답변을 입력해 주세요")
        return v


class UnresolvedCountResponse(BaseModel):
    count: int


InquiryAdminDetail.model_rebuild()
