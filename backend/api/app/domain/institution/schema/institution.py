import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr


class InstitutionCreate(BaseModel):
    name: str
    institution_code: str | None = None
    business_registration_no: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: EmailStr | None = None
    address: str | None = None


class InstitutionUpdate(BaseModel):
    name: str | None = None
    institution_code: str | None = None
    business_registration_no: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: EmailStr | None = None
    address: str | None = None
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
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CourseCreate(BaseModel):
    institution_id: uuid.UUID
    name: str
    course_code: str | None = None
    description: str | None = None
    total_hours: Decimal = Decimal(0)
    category: str | None = None


class CourseUpdate(BaseModel):
    name: str | None = None
    course_code: str | None = None
    description: str | None = None
    total_hours: Decimal | None = None
    category: str | None = None
    is_active: bool | None = None


class CourseResponse(BaseModel):
    id: uuid.UUID
    institution_id: uuid.UUID
    institution_name: str
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
            course_code=c.course_code,
            name=c.name,
            description=c.description,
            total_hours=c.total_hours,
            category=c.category,
            is_active=c.is_active,
            created_at=c.created_at,
        )
