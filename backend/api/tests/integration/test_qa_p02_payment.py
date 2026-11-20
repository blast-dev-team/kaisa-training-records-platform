"""P02 be-payment 회귀 테스트 — 2026-11-18 QA 헌트에서 확인된 버그가 다시 생기지 않는지 검증한다."""

import json

from app.core.database import async_session
from app.domain.payment.repository import payment_repository as repo
from app.domain.payment.service import payment_service
from app.integrations import portone
from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    member_cookie,
    portone_webhook_headers,
)
from tests.integration.test_payment_recovery import (
    FakePortOne,
    _batch,
    _certs,
    _member,
    _order,
    _order_no,
)


async def _paid_order(client, db, monkeypatch):
    pg = FakePortOne(monkeypatch)
    _, records, token = await _member(db)
    _, admin_token = await make_admin(db)
    await db.commit()
    order_no = _order_no(await _batch(client, token, records))
    pg.status[order_no] = "PAID"
    r = await client.post(
        f"/api/payments/{order_no}/confirm", cookies=member_cookie(token)
    )
    assert r.status_code == 200, r.json()
    return pg, await _order(db, order_no), admin_token, token


# P02-1 — reconcile(close) racing a concurrent confirm overwrites paid -> canceled
async def test_close_racing_confirm_leaves_paid_order_canceled(client, db, monkeypatch):
    pg = FakePortOne(monkeypatch)
    _, records, token = await _member(db)
    _, _admin_token = await make_admin(db)
    await db.commit()
    order_no = _order_no(await _batch(client, token, records))
    pg.status[order_no] = "READY"  # member has the payment window open

    real_get = pg.get_payment
    state = {"interleaved": False}

    async def get_payment(payment_id):
        snapshot = await real_get(payment_id)  # reconcile sees READY ...
        if not state["interleaved"]:
            state["interleaved"] = True
            # ... and while its HTTP call is in flight the member finishes paying
            pg.status[payment_id] = "PAID"
            r = await client.post(
                f"/api/payments/{payment_id}/confirm", cookies=member_cookie(token)
            )
            assert r.status_code == 200, r.json()
        return snapshot

    monkeypatch.setattr(portone, "get_payment", get_payment)

    async with async_session() as a:  # e.g. "new request" path / reconcile script
        order = await repo.find_order_by_no(a, order_no)
        outcome = await payment_service.reconcile_order(a, order, close_unpaid=True)

    final = await _order(db, order_no)
    certs = await _certs(db, final.id)
    assert len(certs) == 2 and {c.status for c in certs} == {"issued"}
    # 수정 후: 잠금·재조회로 결제 완료를 발견하면 닫지 않고 "issued" 를 돌려준다
    assert outcome == "issued"
    # Expected: money was taken and certificates are valid -> order must stay 'paid'
    assert final.status == "paid", (
        f"order status={final.status!r}, paid_at={final.paid_at}"
    )


# P02-2 — old-format (2024-01-01, no `type`) cancellation webhook is never applied
async def test_old_format_cancel_webhook_refunds(client, db, monkeypatch):
    pg, order, _, _ = await _paid_order(client, db, monkeypatch)
    pg.status[order.order_no] = "CANCELLED"  # cancelled in PortOne console
    body = json.dumps(
        {"tx_id": "tx-1", "payment_id": order.order_no, "status": "Cancelled"}
    ).encode()
    r = await client.post(
        "/api/payments/webhooks/portone",
        content=body,
        headers=portone_webhook_headers(body, "evt-old-cancel"),
    )
    assert r.status_code == 200
    final = await _order(db, order.order_no)
    certs = await _certs(db, order.id)
    assert final.status == "refunded", (
        final.status,
        [c.status for c in certs],
        r.json(),
    )


# P02-3 — refund accepts an empty reason although docs say 사유 필수
async def test_refund_requires_reason(client, db, monkeypatch):
    _, order, admin_token, _ = await _paid_order(client, db, monkeypatch)
    r = await client.post(
        f"/api/payment-orders/{order.id}/refunds",
        json={"reason": ""},
        cookies=admin_cookie(admin_token),
    )
    assert r.status_code == 422, (r.status_code, r.json().get("status"))


# P02-4 — refund response drops payer/doc fields that the list returns
async def test_refund_response_matches_list_shape(client, db, monkeypatch):
    _, order, admin_token, _ = await _paid_order(client, db, monkeypatch)
    r = await client.post(
        f"/api/payment-orders/{order.id}/refunds",
        json={"reason": "고객 요청"},
        cookies=admin_cookie(admin_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert (body["trainee_name"], body["doc_count"]) == ("홍길동", 2), body


# P02-5 — reconcile of a refunded order says "unpaid order, closed it"
async def test_reconcile_refunded_order_message(client, db, monkeypatch):
    _, order, admin_token, _ = await _paid_order(client, db, monkeypatch)
    r = await client.post(
        f"/api/payment-orders/{order.id}/refunds",
        json={"reason": "고객 요청"},
        cookies=admin_cookie(admin_token),
    )
    assert r.status_code == 200
    r = await client.post(
        f"/api/payment-orders/{order.id}/reconcile", cookies=admin_cookie(admin_token)
    )
    body = r.json()
    assert "결제되지 않은" not in (body["message"] or ""), body["message"]


# P02-6 — admin search treats % / _ as LIKE wildcards (unescaped)
async def test_search_wildcards_escaped(client, db, monkeypatch):
    _, order, admin_token, _ = await _paid_order(client, db, monkeypatch)
    r = await client.get(
        "/api/payment-orders", params={"search": "%"}, cookies=admin_cookie(admin_token)
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0, r.json()["total"]
