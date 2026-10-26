"""결제 대사 — 결제됐는데 미발급인 주문(대기·닫힘 모두)을 발급하고, 30분 지난 미결제 주문을 닫는다.

웹훅·브라우저 confirm 이 모두 끊긴 결제를 메우는 마지막 안전망이다. EC2 cron 에서
10분마다 돌린다:

    */10 * * * * cd /home/ubuntu/kaisa-api/backend/api && \
        docker compose exec -T api python -m app.scripts.reconcile_payments >> /var/log/kaisa-reconcile.log 2>&1

    uv run python -m app.scripts.reconcile_payments            # 로컬
    uv run python -m app.scripts.reconcile_payments --dry-run  # 대상만 출력
"""

import argparse
import asyncio
import logging
from datetime import timedelta

from sqlalchemy import and_, or_, select

from app.core.database import async_session, engine
from app.core.kst import now_kst
from app.domain.certificate.model import Certificate
from app.domain.payment.model import PaymentOrder
from app.domain.payment.service import payment_service

logger = logging.getLogger("reconcile_payments")

# 너무 오래된 주문은 PortOne 결제창도 이미 닫혔다 — 무한히 다시 묻지 않는다
_LOOKBACK = timedelta(days=7)


async def run(dry_run: bool) -> dict[str, int]:
    counts: dict[str, int] = {}
    now = now_kst()
    has_certificate = (
        select(Certificate.id)
        .where(Certificate.payment_order_id == PaymentOrder.id)
        .exists()
    )
    async with async_session() as db:
        targets = (
            await db.execute(
                select(PaymentOrder.id, PaymentOrder.order_no)
                .where(
                    PaymentOrder.created_at > now - _LOOKBACK,
                    or_(
                        # 30분 지난 결제 대기 — 결제됐으면 발급, 아니면 닫는다
                        and_(
                            PaymentOrder.status.in_(("ready", "pending")),
                            PaymentOrder.created_at < now - payment_service.ORDER_TTL,
                        ),
                        # 닫힌 주문인데 확인서가 없음 — 닫은 뒤 결제가 끝났을 수 있다
                        and_(
                            PaymentOrder.status.in_(("canceled", "failed")),
                            ~has_certificate,
                        ),
                    ),
                )
                .order_by(PaymentOrder.created_at)
            )
        ).all()

    for order_id, order_no in targets:
        if dry_run:
            logger.info("target %s", order_no)
            counts["target"] = counts.get("target", 0) + 1
            continue
        # 주문마다 새 세션 — 한 주문의 오류(rollback)가 다른 주문 객체를 망가뜨리지 않게
        try:
            async with async_session() as db:
                order = await db.get(PaymentOrder, order_id)
                if order is None:
                    continue
                outcome, error = await payment_service.reconcile_order_safely(
                    db, order, close_unpaid=False
                )
        except Exception:
            logger.exception("order %s: unexpected error", order_no)
            outcome, error = "error", "unexpected error"
        counts[outcome] = counts.get(outcome, 0) + 1
        if error:
            logger.warning("order %s: %s", order_no, error)
        elif outcome == "issued":
            logger.info("order %s: 결제 확인 → 발급", order_no)
    await engine.dispose()
    return counts


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    counts = asyncio.run(run(args.dry_run))
    logger.info("done %s", counts)


if __name__ == "__main__":
    main()
