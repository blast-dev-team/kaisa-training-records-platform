"""통합 — 결제가 정상 경로를 벗어났을 때의 복구: 이중 결제 방지·대사·환불 2단계.

PortOne 은 전부 가짜로 대체한다. 실제 결제는 PortOne 상태(`status`)로만 흉내 낸다.
"""

from datetime import timedelta

from sqlalchemy import select, update

from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.certificate.model import Certificate, CertificateRequest
from app.domain.payment.model import PaymentOrder, PaymentRefund
from app.integrations import portone
from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_pricing,
    make_record,
    make_trainee,
    member_cookie,
    member_token,
    portone_payment,
)

PRICE = 3000


class FakePortOne:
    """주문번호별 PortOne 결제 상태. 등록 안 된 주문 = 결제창을 열지 않음(404 → None)."""

    def __init__(self, monkeypatch):
        self.status: dict[str, str] = {}
        self.cancel_calls = 0
        self.cancel_behavior = "ok"  # ok | timeout_but_cancelled | fail
        self.get_down = False  # True 면 결제 조회가 장애(PORTONE_API_ERROR)
        self.after_cancel = None  # PG 취소 직후 실행할 코루틴(웹훅 도착 흉내)
        monkeypatch.setattr(portone, "get_payment", self.get_payment)
        monkeypatch.setattr(portone, "cancel_payment", self.cancel_payment)

    async def get_payment(self, payment_id):
        if self.get_down:
            raise api_error("PORTONE_API_ERROR")
        if payment_id not in self.status:
            return None
        return portone_payment(payment_id, total=PRICE, status=self.status[payment_id])

    async def cancel_payment(self, payment_id, reason):
        self.cancel_calls += 1
        if self.cancel_behavior == "fail":
            raise api_error("PORTONE_API_ERROR")
        self.status[payment_id] = "CANCELLED"
        if self.after_cancel is not None:
            await self.after_cancel(payment_id)
        if self.cancel_behavior == "timeout_but_cancelled":
            raise api_error("PORTONE_API_ERROR")  # PG 는 취소했는데 응답이 끊김
        return {"cancellation": {"id": f"cxl-{payment_id}"}}


async def _member(db, *, records=2):
    grade = await make_grade(db, code="g-rcv", name="복구등급")
    user, trainee = await make_trainee(
        db, grade.id, ci_raw="ci-rcv", trainee_no="TR-RCV-1"
    )
    rows = [
        await make_record(db, trainee.id, record_no=f"TRN-RCV-{i:04d}")
        for i in range(records)
    ]
    await make_pricing(db, grade.id, price_krw=PRICE)
    token = await member_token(db, user)
    await db.commit()
    return trainee, rows, token


async def _batch(client, token, records):
    return await client.post(
        "/api/certificate-requests/batch",
        json={"items": [{"training_record_id": str(r.id)} for r in records]},
        cookies=member_cookie(token),
    )


def _order_no(resp) -> str:
    body = resp.json()
    return body[0]["order_no"] if isinstance(body, list) else body["order_no"]


async def _order(db, order_no) -> PaymentOrder:
    db.expire_all()
    return (
        await db.execute(select(PaymentOrder).where(PaymentOrder.order_no == order_no))
    ).scalar_one()


async def _certs(db, order_id) -> list[Certificate]:
    return list(
        (
            await db.execute(
                select(Certificate).where(Certificate.payment_order_id == order_id)
            )
        ).scalars()
    )


class TestDoublePaymentGuard:
    async def test_paid_but_unconfirmed_order_is_issued_instead_of_new_order(
        self, client, db, monkeypatch
    ):
        """카드 결제는 끝났는데 confirm 이 실패한 상태에서 다시 '결제하기' →
        새 주문(두 번째 결제)을 만들지 않고 이전 결제로 N건을 발급한다."""
        pg = FakePortOne(monkeypatch)
        _, records, token = await _member(db)
        first = await _batch(client, token, records)
        assert first.status_code == 201, first.json()
        order_no = _order_no(first)
        pg.status[order_no] = "PAID"  # 결제 완료, confirm 은 안 옴

        again = await _batch(client, token, records)
        assert again.status_code == 409
        assert again.json()["code"] == "PAYMENT_ALREADY_COMPLETED"

        order = await _order(db, order_no)
        assert order.status == "paid"
        certs = await _certs(db, order.id)
        assert len(certs) == 2  # 묶음 1회 결제로 2건 모두 발급
        assert len({c.doc_no for c in certs}) == 1
        orders = (await db.execute(select(PaymentOrder))).scalars().all()
        assert len(orders) == 1

    async def test_unpaid_previous_order_is_closed_and_new_one_created(
        self, client, db, monkeypatch
    ):
        """결제창을 닫고 다시 시도 — 이전 주문은 닫히고 새 주문이 만들어진다."""
        FakePortOne(monkeypatch)
        _, records, token = await _member(db)
        first = await _batch(client, token, records)
        second = await _batch(client, token, records)
        assert second.status_code == 201, second.json()

        old = await _order(db, _order_no(first))
        old_id, old_status = old.id, old.status
        new = await _order(db, _order_no(second))
        assert old_status == "canceled"
        assert new.status == "ready"
        old_requests = (
            (
                await db.execute(
                    select(CertificateRequest).where(
                        CertificateRequest.payment_order_id == old_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert {r.status for r in old_requests} == {"canceled"}

    async def test_partial_overlap_also_checked(self, client, db, monkeypatch):
        """A·B 결제 대기 중에 B·C 를 고르면 — B 가 걸린 이전 주문도 확인한다."""
        pg = FakePortOne(monkeypatch)
        _, records, token = await _member(db, records=3)
        first = await _batch(client, token, records[:2])
        pg.status[_order_no(first)] = "PAID"

        resp = await _batch(client, token, records[1:])
        assert resp.status_code == 409
        order = await _order(db, _order_no(first))
        assert len(await _certs(db, order.id)) == 2

    async def test_new_order_blocked_when_portone_unreachable(
        self, client, db, monkeypatch
    ):
        """이전 결제 여부를 확인할 수 없으면 새 결제를 막는다 — 이중 결제보다 낫다."""
        _, records, token = await _member(db)
        FakePortOne(monkeypatch)
        await _batch(client, token, records)

        async def down(payment_id):
            raise api_error("PORTONE_API_ERROR")

        monkeypatch.setattr(portone, "get_payment", down)
        resp = await _batch(client, token, records)
        assert resp.status_code == 502


class TestAdminReconcile:
    async def test_reconcile_issues_paid_order(self, client, db, monkeypatch):
        pg = FakePortOne(monkeypatch)
        _, records, token = await _member(db)
        _, admin_token = await make_admin(db)
        await db.commit()
        order_no = _order_no(await _batch(client, token, records))
        pg.status[order_no] = "PAID"
        order = await _order(db, order_no)

        resp = await client.post(
            f"/api/payment-orders/{order.id}/reconcile",
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200, resp.json()
        assert resp.json()["outcome"] == "issued"
        assert resp.json()["order"]["status"] == "paid"
        assert len(await _certs(db, order.id)) == 2

    async def test_reconcile_keeps_fresh_unpaid_order(self, client, db, monkeypatch):
        """운영자 버튼은 30분 안 된 대기 주문을 닫지 않는다 — 회원이 결제 중일 수 있다."""
        FakePortOne(monkeypatch)
        _, records, token = await _member(db)
        _, admin_token = await make_admin(db)
        await db.commit()
        order = await _order(db, _order_no(await _batch(client, token, records)))

        resp = await client.post(
            f"/api/payment-orders/{order.id}/reconcile",
            cookies=admin_cookie(admin_token),
        )
        assert resp.json()["outcome"] == "pending"
        assert (await _order(db, order.order_no)).status == "ready"


class TestReconcileScript:
    async def test_script_issues_paid_and_closes_stale(self, client, db, monkeypatch):
        from app.scripts import reconcile_payments

        pg = FakePortOne(monkeypatch)
        _, records, token = await _member(db, records=2)
        paid_no = _order_no(await _batch(client, token, records[:1]))
        stale_no = _order_no(await _batch(client, token, records[1:]))
        pg.status[paid_no] = "PAID"
        # 두 주문 모두 30분 넘게 묵힌다
        await db.execute(
            update(PaymentOrder)
            .where(PaymentOrder.order_no.in_((paid_no, stale_no)))
            .values(created_at=now_kst() - timedelta(minutes=45))
        )
        await db.commit()

        counts = await reconcile_payments.run(dry_run=False)
        assert counts == {"issued": 1, "closed": 1}
        assert (await _order(db, paid_no)).status == "paid"
        assert (await _order(db, stale_no)).status == "canceled"


class TestRefundTwoPhase:
    async def _paid_order(self, client, db, monkeypatch):
        pg = FakePortOne(monkeypatch)
        _, records, token = await _member(db)
        _, admin_token = await make_admin(db)
        await db.commit()
        order_no = _order_no(await _batch(client, token, records))
        pg.status[order_no] = "PAID"
        confirm = await client.post(
            f"/api/payments/{order_no}/confirm", cookies=member_cookie(token)
        )
        assert confirm.status_code == 200
        return pg, await _order(db, order_no), admin_token

    async def _refund(self, client, order, admin_token):
        return await client.post(
            f"/api/payment-orders/{order.id}/refunds",
            json={"reason": "고객 요청"},
            cookies=admin_cookie(admin_token),
        )

    async def test_refund_revokes_whole_bundle(self, client, db, monkeypatch):
        pg, order, admin_token = await self._paid_order(client, db, monkeypatch)
        resp = await self._refund(client, order, admin_token)
        assert resp.status_code == 200, resp.json()
        assert resp.json()["status"] == "refunded"
        assert {c.status for c in await _certs(db, order.id)} == {"revoked"}
        refund = (await db.execute(select(PaymentRefund))).scalar_one()
        assert refund.status == "succeeded"
        assert pg.cancel_calls == 1

    async def test_timeout_after_pg_cancel_still_completes(
        self, client, db, monkeypatch
    ):
        """PG 는 취소했는데 응답이 끊김 → PortOne 재조회로 확인해 환불을 마무리한다.

        예전엔 DB 가 롤백돼 '결제 완료'로 남고, 재시도는 '이미 취소됨' 502 로 영영 실패했다.
        """
        pg, order, admin_token = await self._paid_order(client, db, monkeypatch)
        pg.cancel_behavior = "timeout_but_cancelled"
        resp = await self._refund(client, order, admin_token)
        assert resp.status_code == 200, resp.json()
        assert (await _order(db, order.order_no)).status == "refunded"
        assert {c.status for c in await _certs(db, order.id)} == {"revoked"}

    async def test_pg_failure_leaves_order_and_certificates_intact(
        self, client, db, monkeypatch
    ):
        pg, order, admin_token = await self._paid_order(client, db, monkeypatch)
        pg.cancel_behavior = "fail"
        resp = await self._refund(client, order, admin_token)
        assert resp.status_code == 502
        assert (await _order(db, order.order_no)).status == "paid"
        assert {c.status for c in await _certs(db, order.id)} == {"issued"}
        refund = (await db.execute(select(PaymentRefund))).scalar_one()
        assert refund.status == "failed"

        # 실패 후 다시 시도하면 정상 처리된다
        pg.cancel_behavior = "ok"
        retry = await self._refund(client, order, admin_token)
        assert retry.status_code == 200

    async def test_in_flight_refund_blocks_second_request(
        self, client, db, monkeypatch
    ):
        """환불 버튼을 두 번 눌러도 PG 를 두 번 부르지 않는다."""
        pg, order, admin_token = await self._paid_order(client, db, monkeypatch)
        from app.domain.payment.repository import payment_repository as repo

        attempt = await repo.latest_attempt(db, order.id)
        db.add(
            PaymentRefund(
                payment_attempt_id=attempt.id,
                amount_krw=order.amount_krw,
                reason="먼저 누른 요청",
                status="pending",
                requested_at=now_kst(),
            )
        )
        await db.commit()

        resp = await self._refund(client, order, admin_token)
        assert resp.status_code == 409
        assert pg.cancel_calls == 0


class TestAdminDateFilterKst:
    async def test_early_morning_kst_payment_counts_on_its_own_day(
        self, client, db, monkeypatch
    ):
        """KST 08:00 결제는 그날 조회에 잡힌다 — 예전엔 UTC 로 비교돼 전날로 집계됐다."""
        from datetime import datetime

        from app.core.kst import KST

        FakePortOne(monkeypatch)
        _, records, token = await _member(db, records=1)
        _, admin_token = await make_admin(db)
        await db.commit()
        order_no = _order_no(await _batch(client, token, records))
        await db.execute(
            update(PaymentOrder)
            .where(PaymentOrder.order_no == order_no)
            .values(created_at=datetime(2026, 10, 22, 8, 0, tzinfo=KST))
        )
        await db.commit()

        async def count(day: str) -> int:
            resp = await client.get(
                f"/api/payment-orders?date_from={day}&date_to={day}",
                cookies=admin_cookie(admin_token),
            )
            return resp.json()["total"]

        assert await count("2026-10-22") == 1
        assert await count("2026-10-21") == 0


class TestReviewFollowUps:
    """독립 검수에서 나온 결함 — 재현 후 수정."""

    async def test_payment_in_progress_is_not_closed(self, client, db, monkeypatch):
        """앱카드·ISP 인증 중(PAY_PENDING)인 주문을 닫고 새 주문을 만들면 둘 다 결제될 수 있다."""
        pg = FakePortOne(monkeypatch)
        _, records, token = await _member(db)
        order_no = _order_no(await _batch(client, token, records))
        pg.status[order_no] = "PAY_PENDING"

        resp = await _batch(client, token, records)
        assert resp.status_code == 409
        assert resp.json()["code"] == "PAYMENT_IN_PROGRESS"
        assert (await _order(db, order_no)).status == "ready"
        assert len((await db.execute(select(PaymentOrder))).scalars().all()) == 1

    async def test_closed_order_paid_later_is_recovered(self, client, db, monkeypatch):
        """닫힌 주문이 나중에 결제되면(다른 탭 등) 관리자 재조회·대사가 발급까지 이어 준다."""
        from app.scripts import reconcile_payments

        pg = FakePortOne(monkeypatch)
        _, records, token = await _member(db)
        _, admin_token = await make_admin(db)
        await db.commit()
        first_no = _order_no(await _batch(client, token, records))
        await _batch(client, token, records)  # 첫 주문은 창 미오픈이라 닫힌다
        assert (await _order(db, first_no)).status == "canceled"

        pg.status[first_no] = "PAID"  # 닫힌 뒤 결제 완료
        counts = await reconcile_payments.run(dry_run=False)
        assert counts.get("issued") == 1
        order = await _order(db, first_no)
        assert order.status == "paid"
        assert len(await _certs(db, order.id)) == 2

        again = await client.post(
            f"/api/payment-orders/{order.id}/reconcile",
            cookies=admin_cookie(admin_token),
        )
        assert again.json()["outcome"] == "issued"

    async def test_script_survives_failing_order(self, client, db, monkeypatch):
        """한 주문의 오류가 대사 배치 전체를 멈추지 않는다 (예전엔 MissingGreenlet 크래시)."""
        from app.scripts import reconcile_payments

        pg = FakePortOne(monkeypatch)
        _, records, token = await _member(db, records=2)
        bad_no = _order_no(await _batch(client, token, records[:1]))
        good_no = _order_no(await _batch(client, token, records[1:]))
        # 금액이 다른 PAID — 확정이 409 로 거절되는 주문
        pg.status[bad_no] = "PAID"
        original = pg.get_payment

        async def mismatched(payment_id):
            result = await original(payment_id)
            if payment_id == bad_no and result:
                result["amount"]["total"] = PRICE + 1
            return result

        monkeypatch.setattr(portone, "get_payment", mismatched)
        pg.status[good_no] = "PAID"
        await db.execute(
            update(PaymentOrder)
            .where(PaymentOrder.order_no.in_((bad_no, good_no)))
            .values(created_at=now_kst() - timedelta(minutes=45))
        )
        await db.commit()

        counts = await reconcile_payments.run(dry_run=False)
        assert counts == {"error": 1, "issued": 1}
        assert (await _order(db, good_no)).status == "paid"

    async def test_cancel_webhook_during_admin_refund_counts_once(
        self, client, db, monkeypatch
    ):
        """어드민 PG 취소 직후 취소 웹훅이 먼저 도착해도 환불은 한 번만 기록된다."""
        import json

        from app.core.config import settings
        from tests.integration.helpers import portone_webhook_headers

        pg = FakePortOne(monkeypatch)
        _, records, token = await _member(db)
        _, admin_token = await make_admin(db)
        await db.commit()
        order_no = _order_no(await _batch(client, token, records))
        pg.status[order_no] = "PAID"
        await client.post(
            f"/api/payments/{order_no}/confirm", cookies=member_cookie(token)
        )
        order = await _order(db, order_no)

        async def webhook_arrives(payment_id):
            body = json.dumps(
                {
                    "type": "Transaction.Cancelled",
                    "data": {
                        "paymentId": payment_id,
                        "storeId": settings.PORTONE_STORE_ID,
                    },
                }
            ).encode()
            resp = await client.post(
                "/api/payments/webhooks/portone",
                content=body,
                headers=portone_webhook_headers(body, "msg-race-cancel"),
            )
            assert resp.json()["cancellation"] == "refunded"

        pg.after_cancel = webhook_arrives
        resp = await client.post(
            f"/api/payment-orders/{order.id}/refunds",
            json={"reason": "고객 요청"},
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200, resp.json()
        refunds = (await db.execute(select(PaymentRefund))).scalars().all()
        assert [r.status for r in refunds] == ["succeeded"]
        assert {c.status for c in await _certs(db, order.id)} == {"revoked"}

    async def test_unknown_pg_state_keeps_refund_pending(self, client, db, monkeypatch):
        """취소 응답도 끊기고 재조회도 장애면 '결제 그대로'라고 단정하지 않는다."""
        pg = FakePortOne(monkeypatch)
        _, records, token = await _member(db)
        _, admin_token = await make_admin(db)
        await db.commit()
        order_no = _order_no(await _batch(client, token, records))
        pg.status[order_no] = "PAID"
        await client.post(
            f"/api/payments/{order_no}/confirm", cookies=member_cookie(token)
        )
        order = await _order(db, order_no)

        async def cancel_then_outage(payment_id, reason):
            pg.status[payment_id] = "CANCELLED"
            pg.get_down = True
            raise api_error("PORTONE_API_ERROR")

        monkeypatch.setattr(portone, "cancel_payment", cancel_then_outage)
        resp = await client.post(
            f"/api/payment-orders/{order.id}/refunds",
            json={"reason": "고객 요청"},
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 502
        assert "확인하지 못했어요" in resp.json()["message"]
        refund = (await db.execute(select(PaymentRefund))).scalar_one()
        assert refund.status == "pending"

        # 장애가 풀린 뒤 다시 누르면 PG 상태(취소됨)로 마무리된다
        pg.get_down = False
        retry = await client.post(
            f"/api/payment-orders/{order.id}/refunds",
            json={"reason": "고객 요청"},
            cookies=admin_cookie(admin_token),
        )
        assert retry.status_code == 200
        db.expire_all()
        refunds = (await db.execute(select(PaymentRefund))).scalars().all()
        assert [r.status for r in refunds] == ["succeeded"]
