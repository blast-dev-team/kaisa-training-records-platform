import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.core.crypto import decrypt_field


class CompletionCertificateIssueRequest(BaseModel):
    """어드민 수료증 발급 — 1 이력당 1장. 이미 발급된 건은 기존 수료증 재사용."""

    training_record_ids: list[uuid.UUID] = Field(min_length=1)


class CompletionCertificateResponse(BaseModel):
    id: uuid.UUID
    certificate_no: str
    training_record_id: uuid.UUID
    trainee_id: uuid.UUID
    # 어드민 발급 화면 표시용 — 발급 스냅샷 복호화
    trainee_name: str | None = None
    trainee_birth_date: date | None
    course_name: str
    session_name: str | None
    institution_name: str
    completed_hours: Decimal
    started_at: date | None
    ended_at: date | None
    issued_at: datetime
    status: str

    @classmethod
    def from_orm(cls, cert) -> "CompletionCertificateResponse":
        return cls(
            id=cert.id,
            certificate_no=cert.certificate_no,
            training_record_id=cert.training_record_id,
            trainee_id=cert.trainee_id,
            trainee_name=decrypt_field(cert.issued_name_encrypted),
            trainee_birth_date=cert.trainee_birth_date,
            course_name=cert.course_name,
            session_name=cert.session_name,
            institution_name=cert.institution_name,
            completed_hours=cert.completed_hours,
            started_at=cert.started_at,
            ended_at=cert.ended_at,
            issued_at=cert.issued_at,
            status=cert.status,
        )
