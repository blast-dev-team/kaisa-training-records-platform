import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_trainee, require_admin
from app.core.response import PagedResponse
from app.domain.auth.model import AdminUser
from app.domain.payment.schema import (
    PaymentConfirmResponse,
    PaymentOrderResponse,
    PaymentReconcileResponse,
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
    # PortOne V2 = Standard Webhooks 헤더 (webhook-id / -timestamp / -signature)
    body = await request.body()
    return await webhook_service.handle_portone_webhook(
        db, {k.lower(): v for k, v in request.headers.items()}, body
    )


@admin_router.get("", response_model=PagedResponse[PaymentOrderResponse])
async def list_payment_orders(
    trainee_id: uuid.UUID | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    orders, total, doc_counts, first_course_names = await refund_service.list_orders(
        db, trainee_id=trainee_id, status=status, date_from=date_from, date_to=date_to, search=search, page=page, limit=limit
    )
    return PagedResponse(
        items=[
            PaymentOrderResponse.from_orm(
                o,
                doc_count=doc_counts.get(o.id, 0),
                first_course_name=first_course_names.get(o.id),
            )
            for o in orders
        ],
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
    order = await refund_service.refund_order(db, order_id, body.reason, admin, body.force)
    return PaymentOrderResponse.model_validate(order)


_RECONCILE_MESSAGES = {
    "issued": "결제가 확인돼 확인서가 발급돼 있어요",
    "closed": "결제되지 않은 주문이라 닫았어요",
    "pending": "아직 결제가 완료되지 않았어요",
    "in_progress": "PG 에서 결제가 진행 중이에요. 잠시 후 다시 확인해 주세요",
}


@admin_router.post("/{order_id}/reconcile", response_model=PaymentReconcileResponse)
async def reconcile_payment_order(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    """PortOne 재조회 — '결제했는데 확인서가 안 나왔어요' 문의 대응. 결제됐으면 바로 발급한다.

    운영자가 누르는 버튼이라 30분이 안 된 결제 대기 주문은 닫지 않는다(회원이 결제 중일 수 있음).
    이미 닫힌(취소·실패) 주문도 PortOne 에서 결제됐으면 발급한다 — 닫은 뒤 결제가 끝난 경우.
    """
    order = await refund_service.get_order(db, order_id)
    outcome, error = await payment_service.reconcile_order_safely(
        db, order, close_unpaid=False
    )
    order = await refund_service.get_order(db, order_id)
    return PaymentReconcileResponse(
        outcome=outcome,
        message=error or _RECONCILE_MESSAGES.get(outcome),
        order=PaymentOrderResponse.model_validate(order),
    )
