import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_trainee, require_admin
from app.core.response import PagedResponse
from app.domain.auth.model import AdminUser
from app.domain.payment.schema import (
    PaymentConfirmResponse,
    PaymentOrderResponse,
    RefundCreate,
)
from app.domain.payment.service import payment_service, refund_service, webhook_service
from app.domain.trainee.model import Trainee

# 회원 — 결제 확인
router = APIRouter(prefix="/payments", tags=["payments"])

# 공개 — PortOne 웹훅
webhook_router = APIRouter(prefix="/payments/webhooks", tags=["payments"])

# 어드민 — 결제 주문 관리
admin_router = APIRouter(prefix="/payment-orders", tags=["payments"])


@router.post("/{order_no}/confirm", response_model=PaymentConfirmResponse)
async def confirm_payment(
    order_no: str,
    trainee: Trainee = Depends(get_current_trainee),
    db: AsyncSession = Depends(get_db),
):
    return await payment_service.confirm_payment(db, trainee, order_no)


@webhook_router.post("/portone")
async def portone_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    signature = request.headers.get("x-portone-signature", "")
    body = await request.body()
    return await webhook_service.handle_portone_webhook(db, signature, body)


@admin_router.get("", response_model=PagedResponse[PaymentOrderResponse])
async def list_payment_orders(
    trainee_id: uuid.UUID | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    orders, total = await refund_service.list_orders(
        db, trainee_id=trainee_id, status=status, page=page, limit=limit
    )
    return PagedResponse(
        items=[PaymentOrderResponse.model_validate(o) for o in orders],
        total=total,
        page=page,
        limit=limit,
    )


@admin_router.post("/{order_id}/refunds", response_model=PaymentOrderResponse)
async def refund_payment_order(
    order_id: uuid.UUID,
    body: RefundCreate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_admin),
):
    order = await refund_service.refund_order(db, order_id, body.reason, admin)
    return PaymentOrderResponse.model_validate(order)
