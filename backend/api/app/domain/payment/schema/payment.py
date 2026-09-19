import uuid
from datetime import datetime

from pydantic import BaseModel

from app.domain.certificate.schema import MyCertificateBrief


class PaymentConfirmResponse(BaseModel):
    """결제 확인 — 발급까지 동일 트랜잭션으로 완료된 뒤 응답.

    다건 발급 주문은 certificates 에 전부 담긴다. certificate 는
    단건 호환용(첫 번째) 필드.
    """

    order_no: str
    status: str
    paid_at: datetime | None
    certificate: MyCertificateBrief | None = None
    certificates: list[MyCertificateBrief] = []


class PaymentOrderResponse(BaseModel):
    """어드민 — 결제 주문 목록."""

    id: uuid.UUID
    order_no: str
    certificate_request_id: uuid.UUID | None = None
    trainee_id: uuid.UUID
    trainee_name: str | None = None
    amount_krw: int
    currency: str
    status: str
    paid_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, o) -> "PaymentOrderResponse":
        return cls(
            id=o.id,
            order_no=o.order_no,
            certificate_request_id=o.certificate_request_id,
            trainee_id=o.trainee_id,
            trainee_name=o.trainee.name if o.trainee else None,
            amount_krw=o.amount_krw,
            currency=o.currency,
            status=o.status,
            paid_at=o.paid_at,
            created_at=o.created_at,
        )


class RefundCreate(BaseModel):
    reason: str
    # 오류 정정 환불 — 발급된 확인서가 있어도 강제 환불 (확인서 폐기는 별도 처리)
    force: bool = False
