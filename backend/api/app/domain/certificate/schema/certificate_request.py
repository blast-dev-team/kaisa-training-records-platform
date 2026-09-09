import uuid
from datetime import datetime

from pydantic import BaseModel

from app.domain.certificate.schema.certificate import MyCertificateBrief


class CertificateRequestCreate(BaseModel):
    training_record_id: uuid.UUID
    issue_type: str = "original"


class CertificateRequestResponse(BaseModel):
    """신청 응답 — 유료면 결제에 넘길 order_no, 0원이면 발급된 확인서까지."""

    id: uuid.UUID
    request_no: str
    training_record_id: uuid.UUID
    issue_type: str
    amount_krw: int
    currency: str
    status: str
    requested_at: datetime
    order_no: str | None = None
    certificate: MyCertificateBrief | None = None

    @classmethod
    def from_orm(cls, request) -> "CertificateRequestResponse":
        order = request.payment_orders[0] if request.payment_orders else None
        certificate = request.certificates[0] if request.certificates else None
        return cls(
            id=request.id,
            request_no=request.request_no,
            training_record_id=request.training_record_id,
            issue_type=request.issue_type,
            amount_krw=request.amount_krw,
            currency=request.currency,
            status=request.status,
            requested_at=request.requested_at,
            order_no=order.order_no if order else None,
            certificate=MyCertificateBrief.from_orm(certificate)
            if certificate
            else None,
        )
