import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.core.validation import Hours, NonBlankStr, reject_explicit_null

# 내부/외부 구분 — 미선택은 없다(기본 external). internal 인 기관의 수료내역만 수료증 발급 가능
InstitutionType = Literal["internal", "external"]


class InstitutionCreate(BaseModel):
    name: NonBlankStr = Field(max_length=255)
    institution_code: str | None = Field(default=None, max_length=100)
    business_registration_no: str | None = Field(default=None, max_length=50)
    contact_name: str | None = Field(default=None, max_length=100)
    contact_phone: str | None = Field(default=None, max_length=50)
    contact_email: EmailStr | None = None
    address: str | None = None
    # 미선택 정책 폐지 — API 등록·임포트도 기본 external. 명시 없이는 외부다
    institution_type: InstitutionType = "external"


class InstitutionUpdate(BaseModel):
    name: NonBlankStr | None = Field(default=None, max_length=255)
    institution_code: str | None = Field(default=None, max_length=100)
    business_registration_no: str | None = Field(default=None, max_length=50)
    contact_name: str | None = Field(default=None, max_length=100)
    contact_phone: str | None = Field(default=None, max_length=50)
    contact_email: EmailStr | None = None
    address: str | None = None
    institution_type: InstitutionType | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def _not_null(self):
        reject_explicit_null(self, ("name", "is_active", "institution_type"))
        return self


class InstitutionResponse(BaseModel):
    id: uuid.UUID
    institution_code: str | None
    name: str
    business_registration_no: str | None
    contact_name: str | None
    contact_phone: str | None
    contact_email: str | None
    address: str | None
    institution_type: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CourseCreate(BaseModel):
    institution_id: uuid.UUID
    name: NonBlankStr = Field(max_length=255)
    session_name_id: uuid.UUID | None = None  # 회차명 마스터 참조
    is_external: bool = False  # 외부 교육과정
    course_code: str | None = Field(default=None, max_length=100)
    description: str | None = None
    total_hours: Hours  # 필수 — 빠지면 0시간 과정이 된다 (2026-11-20)
    category: str | None = Field(default=None, max_length=100)


class CourseUpdate(BaseModel):
    """과정 수정 — 기관(institution_id)을 바꾸면 연결된 일정·교육이력도 새 기관으로 함께 맞춘다."""

    name: NonBlankStr | None = Field(default=None, max_length=255)
    # 기관 정정 — 서비스가 일정 source·교육이력 기관/구분까지 함께 갱신한다
    institution_id: uuid.UUID | None = None
    session_name_id: uuid.UUID | None = None
    is_external: bool | None = None
    course_code: str | None = Field(default=None, max_length=100)
    description: str | None = None
    total_hours: Hours | None = None
    category: str | None = Field(default=None, max_length=100)
    is_active: bool | None = None

    @model_validator(mode="after")
    def _not_null(self):
        reject_explicit_null(self, ("name", "total_hours", "is_active"))
        return self


class CourseResponse(BaseModel):
    id: uuid.UUID
    institution_id: uuid.UUID
    institution_name: str
    session_name_id: uuid.UUID | None = None
    session_name: str | None = None
    is_external: bool = False
    course_code: str | None
    name: str
    description: str | None
    total_hours: Decimal
    category: str | None
    is_active: bool
    # 기관 내부/외부 — 일정 등록 시 '외부 교육' 체크박스 기본값 판단용
    institution_type: str | None = None
    created_at: datetime
    updated_at: datetime | None = None

    @classmethod
    def from_orm(cls, c) -> "CourseResponse":
        return cls(
            id=c.id,
            institution_id=c.institution_id,
            institution_name=c.institution.name if c.institution else "",
            institution_type=(
                c.institution.institution_type if c.institution else None
            ),
            session_name_id=c.session_name_id,
            session_name=c.session_name.name if c.session_name else None,
            is_external=c.is_external,
            course_code=c.course_code,
            name=c.name,
            description=c.description,
            total_hours=c.total_hours,
            category=c.category,
            is_active=c.is_active,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
