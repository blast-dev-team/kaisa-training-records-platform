import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class MeProfileResponse(BaseModel):
    """회원 포털 프로필 — user 계정 + 연결된 trainee 정보."""

    user_id: uuid.UUID
    trainee_id: uuid.UUID
    trainee_no: str | None
    name: str
    email: str | None
    phone_masked: str | None
    grade_name: str | None
    review_status: str
    last_login_at: datetime | None


class MyCertificateResponse(BaseModel):
    id: uuid.UUID
    certificate_no: str
    training_record_id: uuid.UUID
    course_name: str
    institution_name: str
    total_hours: Decimal
    completed_hours: Decimal
    training_started_at: date | None
    training_ended_at: date | None
    issue_type: str
    issued_at: datetime
    expires_at: datetime | None
    status: str

    @classmethod
    def from_orm_with_issue_type(cls, c, issue_type: str) -> "MyCertificateResponse":
        """issue_type 은 certificates 가 아닌 certificate_requests 에 있어 같이 받는다."""
        return cls(
            id=c.id,
            certificate_no=c.certificate_no,
            training_record_id=c.training_record_id,
            course_name=c.course_name,
            institution_name=c.institution_name,
            total_hours=c.total_hours,
            completed_hours=c.completed_hours,
            training_started_at=c.training_started_at,
            training_ended_at=c.training_ended_at,
            issue_type=issue_type,
            issued_at=c.issued_at,
            expires_at=c.expires_at,
            status=c.status,
        )


class MyCertificateRequestResponse(BaseModel):
    id: uuid.UUID
    request_no: str
    training_record_id: uuid.UUID
    course_name: str | None = None
    issue_type: str
    amount_krw: int
    status: str
    requested_at: datetime
    paid_at: datetime | None
    issued_at: datetime | None

    model_config = {"from_attributes": True}


class MyPaymentOrderResponse(BaseModel):
    id: uuid.UUID
    order_no: str
    certificate_request_id: uuid.UUID
    amount_krw: int
    status: str
    paid_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CertificatePriceResponse(BaseModel):
    training_record_id: uuid.UUID
    course_name: str
    issue_type: str
    grade_name: str | None
    price_krw: int
    currency: str
