import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.core.crypto import decrypt_field


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
    bundle_no: str | None = None
    # 문서번호 — 발급 건당 1개 (묶음 멤버 전부 동일). 재발급은 새 번호
    doc_no: str | None = None
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
    downloaded_at: datetime | None = None
    download_count: int = 0

    @classmethod
    def from_orm(cls, c) -> "CertificateResponse":
        return cls(
            id=c.id,
            certificate_no=c.certificate_no,
            bundle_no=c.bundle_no,
            doc_no=c.doc_no,
            certificate_request_id=c.certificate_request_id,
            trainee_id=c.trainee_id,
            training_record_id=c.training_record_id,
            payment_order_id=c.payment_order_id,
            issued_name=decrypt_field(c.issued_name_encrypted),
            course_name=c.course_name,
            institution_name=c.institution_name,
            total_hours=c.total_hours,
            completed_hours=c.completed_hours,
            training_started_at=c.training_started_at,
            training_ended_at=c.training_ended_at,
            issued_at=c.issued_at,
            expires_at=c.expires_at,
            status=c.status,
            revoked_at=c.revoked_at,
            revoked_reason=c.revoked_reason,
            downloaded_at=c.downloaded_at,
            download_count=c.download_count,
        )


class CertificateIssueGroup(BaseModel):
    """어드민 발급 그룹 — 감리원별 묶음(=문서 1건). 선택 이력이 행으로 들어간다."""

    trainee_id: uuid.UUID
    record_ids: list[uuid.UUID] = Field(min_length=1)


class CertificateIssueRequest(BaseModel):
    groups: list[CertificateIssueGroup] = Field(min_length=1)


class CertificateIssueGroupResult(BaseModel):
    trainee_id: uuid.UUID
    doc_no: str
    certificate_ids: list[uuid.UUID] = []


class CertificateIssueResult(BaseModel):
    groups: list[CertificateIssueGroupResult]


class CertificateRevokeRequest(BaseModel):
    reason: str
