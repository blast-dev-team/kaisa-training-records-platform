import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr

# 내부/외부 구분 — None(미선택) 허용. internal 인 기관의 수료내역만 수료증 발급 가능
InstitutionType = Literal["internal", "external"]


class InstitutionCreate(BaseModel):
    name: str
    institution_code: str | None = None
    business_registration_no: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: EmailStr | None = None
    address: str | None = None
    institution_type: InstitutionType | None = None


class InstitutionUpdate(BaseModel):
    name: str | None = None
    institution_code: str | None = None
    business_registration_no: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: EmailStr | None = None
    address: str | None = None
    institution_type: InstitutionType | None = None
    is_active: bool | None = None


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
    name: str
    session_name_id: uuid.UUID | None = None  # 회차명 마스터 참조
    is_external: bool = False  # 외부 교육과정
    course_code: str | None = None
    description: str | None = None
    total_hours: Decimal = Decimal(0)
    category: str | None = None


class CourseUpdate(BaseModel):
    name: str | None = None
    session_name_id: uuid.UUID | None = None
    is_external: bool | None = None
    course_code: str | None = None
    description: str | None = None
    total_hours: Decimal | None = None
    category: str | None = None
    is_active: bool | None = None


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
    created_at: datetime

    @classmethod
    def from_orm(cls, c) -> "CourseResponse":
        return cls(
            id=c.id,
            institution_id=c.institution_id,
            institution_name=c.institution.name if c.institution else "",
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
        )
