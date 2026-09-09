import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class MyCertificateBrief(BaseModel):
    """회원 신청 응답에 끼워 넣는 요약 — 민감정보 없음."""

    id: uuid.UUID
    certificate_no: str
    issued_at: datetime
    expires_at: datetime | None
    status: str

    model_config = {"from_attributes": True}


class CertificateResponse(BaseModel):
    """어드민 목록·상세 — 발급 스냅샷 그대로."""

    id: uuid.UUID
    certificate_no: str
    certificate_request_id: uuid.UUID
    trainee_id: uuid.UUID
    training_record_id: uuid.UUID
    payment_order_id: uuid.UUID | None
    issued_name: str
    course_name: str
    institution_name: str
    total_hours: Decimal
    completed_hours: Decimal
    training_started_at: date | None
    training_ended_at: date | None
    issued_at: datetime
    expires_at: datetime | None
    status: str
    revoked_at: datetime | None
    revoked_reason: str | None

    model_config = {"from_attributes": True}


class CertificateRevokeRequest(BaseModel):
    reason: str
