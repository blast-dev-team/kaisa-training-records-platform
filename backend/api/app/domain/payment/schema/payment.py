import uuid
from datetime import datetime

from pydantic import BaseModel

from app.domain.certificate.schema import MyCertificateBrief


class PaymentConfirmResponse(BaseModel):
    """결제 확인 — 발급까지 동일 트랜잭션으로 완료된 뒤 응답."""

    order_no: str
    status: str
    paid_at: datetime | None
    certificate: MyCertificateBrief


class PaymentOrderResponse(BaseModel):
    """어드민 — 결제 주문 목록."""

    id: uuid.UUID
    order_no: str
    certificate_request_id: uuid.UUID
    trainee_id: uuid.UUID
    amount_krw: int
    currency: str
    status: str
    paid_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RefundCreate(BaseModel):
    reason: str
