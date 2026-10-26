"""결제 확인 — single-fetch 검증 후 발급까지 동일 트랜잭션.

확정(confirm_order)은 멱등이라 여러 경로에서 부른다: 브라우저 confirm, 모바일 복귀
화면, 웹훅, 관리자 재조회, 주기 대사 스크립트, 새 결제 신청 직전의 이전 주문 확인.
결제는 됐는데 어느 한 경로가 끊겨도 다른 경로가 발급까지 이어 준다.
"""

from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.certificate.model import Certificate, CertificateRequest
from app.domain.certificate.schema import MyCertificateBrief
from app.domain.certificate.service import issuance_service
from app.domain.payment.model import PaymentOrder
from app.domain.payment.repository import payment_repository as repo
from app.domain.payment.schema import PaymentConfirmResponse
from app.domain.trainee.model import Trainee
from app.integrations import portone


async def _find_certificates(db: AsyncSession, order_id) -> list[Certificate]:
    result = await db.execute(
        select(Certificate).where(Certificate.payment_order_id == order_id)
    )
    return list(result.scalars().all())


def _validate_payment(result: dict | None, order: PaymentOrder) -> None:
    """PortOne 결제 단일조회 결과 검증 — 상태·금액·통화·스토어."""
    if result is None or result.get("status") != "PAID":
        raise api_error("PAYMENT_NOT_PAID", message="결제가 완료되지 않았어요")
    amount = result.get("amount") or {}
    total = amount.get("total") or amount.get("paid") or amount.get("amount")
    # V2 응답의 currency 는 최상위 필드다 (amount 안이 아님) — 둘 다 보고, 없으면 KRW
    currency = result.get("currency") or amount.get("currency") or "KRW"
    if total != order.amount_krw or currency != "KRW":
        raise api_error(
            "PAYMENT_AMOUNT_MISMATCH",
            status_code=409,
            message="결제 금액이 주문 금액과 일치하지 않아요",
        )
    if settings.PORTONE_STORE_ID and result.get("storeId") not in (
        None,
        settings.PORTONE_STORE_ID,
    ):
        raise api_error(
            "PAYMENT_STORE_MISMATCH",
            status_code=409,
            message="다른 스토어의 결제예요",
        )


async def _find_requests(db: AsyncSession, order: PaymentOrder) -> list[CertificateRequest]:
    """주문에 묶인 신청들 — 다건은 payment_order_id, 레거시 단건은 legacy FK 로 조회."""
    result = await db.execute(
        select(CertificateRequest).where(
            CertificateRequest.payment_order_id == order.id
        )
    )
    requests = list(result.scalars().all())
    if not requests and order.certificate_request_id is not None:
        legacy = (
            await db.execute(
                select(CertificateRequest).where(
                    CertificateRequest.id == order.certificate_request_id
                )
            )
        ).scalar_one()
        legacy.payment_order_id = order.id
        requests = [legacy]
    return requests


async def confirm_order(
    db: AsyncSession, order: PaymentOrder
) -> PaymentConfirmResponse:
    """주문 결제 확정 — 웹훅·수동 confirm 공통 경로. single-fetch 후 발급.

    다건 발급 주문이면 묶인 N건을 같은 트랜잭션에서 전부 발급한다.
    """
    certificates = await _find_certificates(db, order.id)
    if certificates:  # 이미 발급까지 완료 — 멱등 반환
        return PaymentConfirmResponse(
            order_no=order.order_no,
            status=order.status,
            paid_at=order.paid_at,
            certificate=MyCertificateBrief.model_validate(certificates[0]),
            certificates=[
                MyCertificateBrief.model_validate(c) for c in certificates
            ],
        )

    if not settings.PORTONE_API_SECRET:
        raise api_error(
            "PORTONE_NOT_CONFIGURED",
            status_code=503,
            message="결제가 설정되지 않았어요",
        )
    result = await portone.get_payment(order.order_no)
    _validate_payment(result, order)

    now = now_kst()
    attempt = await repo.latest_attempt(db, order.id)
    if attempt is not None:
        attempt.status = "paid"
        attempt.provider_payment_id = str(result.get("id") or order.order_no)
        attempt.paid_amount_krw = order.amount_krw
        attempt.payment_method = (result.get("method") or {}).get("type")
        attempt.receipt_url = result.get("receiptUrl") or result.get("receipt_url")
        attempt.paid_at = now
        attempt.raw_response = result

    order.status = "paid"
    order.paid_at = now

    requests = await _find_requests(db, order)
    # 결제 1건으로 발급된 N건 = 묶음 확인서 1건 — 문서번호도 이벤트당 1개
    doc_no = await issuance_service.allocate_doc_no(db)
    certificates = []
    for request in requests:
        request.status = "paid"
        request.paid_at = now
        certificates.append(
            await issuance_service.issue_certificate(
                db, request, order.id, doc_no=doc_no
            )
        )
    issuance_service.assign_bundle_no(certificates)
    await db.commit()

    return PaymentConfirmResponse(
        order_no=order.order_no,
        status=order.status,
        paid_at=order.paid_at,
        certificate=MyCertificateBrief.model_validate(certificates[0]),
        certificates=[
            MyCertificateBrief.model_validate(c) for c in certificates
        ],
    )


async def confirm_payment(
    db: AsyncSession, trainee: Trainee, order_no: str
) -> PaymentConfirmResponse:
    """회원 수동 confirm — 소유 스코프(타인 주문 404) 후 공통 경로."""
    order = await repo.find_order_by_no(db, order_no, trainee_id=trainee.id)
    if order is None:
        raise api_error("NOT_FOUND", message="결제 주문을 찾을 수 없어요")
    return await confirm_order(db, order)


# ── 결제 대기 주문 정리 — 대사(reconcile) ───────────────────────────────────────

# 결제 대기 주문의 수명. 이 시간이 지나도록 PortOne 에서 결제되지 않은 주문은 닫는다.
ORDER_TTL = timedelta(minutes=30)

# PortOne V2 결제 상태 중 다시는 결제될 수 없는 것
_PORTONE_CLOSED_STATUSES = {"FAILED", "CANCELLED"}


async def close_order(db: AsyncSession, order: PaymentOrder, status: str = "canceled") -> None:
    """미결제 주문을 닫는다 — 묶인 신청도 취소해 교육생 삭제 등을 막지 않게.

    닫은 뒤에 결제가 들어와도(웹훅·대사) confirm_order 는 주문 상태와 무관하게
    PortOne 결과로 발급한다 — 돈을 냈으면 확인서를 받는다.
    """
    order.status = status
    attempt = await repo.latest_attempt(db, order.id)
    if attempt is not None and attempt.status == "ready":
        attempt.status = status
    for request in await _find_requests(db, order):
        if request.status == "payment_pending":
            request.status = "canceled"


async def reconcile_order(
    db: AsyncSession, order: PaymentOrder, *, close_unpaid: bool
) -> str:
    """PortOne 에 다시 물어 주문을 실제 상태에 맞춘다. 커밋까지 한다.

    반환: issued(발급됨·이미 발급) / closed(닫음·닫혀 있음) / pending(아직 결제 대기)
          / in_progress(PG 에서 결제 진행 중 — 닫으면 이중 결제가 될 수 있음).
    close_unpaid=True 면 결제창을 안 열었거나(404) 열었다 닫은(READY) 주문을 나이와
    무관하게 닫는다(새 결제 신청 직전). False 면 ORDER_TTL 이 지난 것만 닫는다(주기 대사).
    이미 닫힌 주문(canceled/failed)도 다시 확인한다 — 닫은 뒤 결제가 끝났을 수 있다.
    """
    if await _find_certificates(db, order.id):
        return "issued"
    if order.status not in ("ready", "pending", "paid", "canceled", "failed"):
        return "closed"  # refunded 등 — 대사 대상 아님
    is_open = order.status in ("ready", "pending")
    if not settings.PORTONE_API_SECRET:
        # 로컬 — 실제 결제가 일어날 수 없으므로 확인 없이 닫아도 안전하다
        if is_open and (close_unpaid or _is_stale(order)):
            await close_order(db, order)
            await db.commit()
            return "closed"
        return "pending" if is_open else "closed"

    result = await portone.get_payment(order.order_no)
    status = (result or {}).get("status")
    if status == "PAID":
        await confirm_order(db, order)  # 금액·스토어 검증 포함, 커밋
        return "issued"
    if order.status == "paid":
        return "pending"  # 우리 쪽은 결제 완료인데 PG 가 PAID 가 아님 — 사람이 볼 일
    if not is_open:
        return "closed"
    if status in _PORTONE_CLOSED_STATUSES:
        await close_order(db, order, "failed" if status == "FAILED" else "canceled")
        await db.commit()
        return "closed"
    if status not in (None, "READY"):
        # PAY_PENDING·PENDING·VIRTUAL_ACCOUNT_ISSUED 등 — 앱카드·ISP 인증처럼 결제가
        # 진행 중이다. 닫고 새 주문을 만들면 둘 다 결제될 수 있으므로 닫지 않는다
        return "in_progress"
    if close_unpaid or _is_stale(order):
        await close_order(db, order)
        await db.commit()
        return "closed"
    return "pending"


def _is_stale(order: PaymentOrder) -> bool:
    return order.created_at is not None and order.created_at < now_kst() - ORDER_TTL


async def reconcile_order_safely(
    db: AsyncSession, order: PaymentOrder, *, close_unpaid: bool
) -> tuple[str, str | None]:
    """대사 배치·관리자 화면용 — 한 주문의 실패가 다른 주문을 막지 않게 오류를 돌려준다."""
    try:
        return await reconcile_order(db, order, close_unpaid=close_unpaid), None
    except HTTPException as exc:
        await db.rollback()
        detail = exc.detail if isinstance(exc.detail, dict) else {"message": exc.detail}
        return "error", str(detail.get("message") or detail)
