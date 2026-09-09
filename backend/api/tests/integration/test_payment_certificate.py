"""통합 — 확인서 신청 → 결제 confirm → 발급 + 웹훅 멱급 + 재발급."""

import hashlib
import hmac
import json
import time

from sqlalchemy import select

from app.core.config import settings
from app.domain.certificate.model import Certificate
from app.integrations import portone
from tests.integration.helpers import (
    make_grade,
    make_pricing,
    make_record,
    make_trainee,
    member_cookie,
    member_token,
    portone_payment,
)


async def _member(db, *, price_original=0, price_reissue=5000):
    grade = await make_grade(db, code="g-pay", name="결제등급")
    user, trainee = await make_trainee(
        db, grade.id, ci_raw="ci-pay", trainee_no="TR-2026-0007"
    )
    record = await make_record(db, trainee.id, record_no="TRN-PAY-0001")
    await make_pricing(db, grade.id, price_krw=price_original)
    await make_pricing(db, grade.id, issue_type="reissue", price_krw=price_reissue)
    token = await member_token(db, user)
    await db.commit()
    return trainee, record, token


async def _request(client, token, record_id, issue_type="original"):
    return await client.post(
        "/api/certificate-requests",
        json={"training_record_id": str(record_id), "issue_type": issue_type},
        cookies=member_cookie(token),
    )


def _webhook_headers(body: bytes) -> dict[str, str]:
    ts = str(int(time.time()))
    digest = hmac.new(
        settings.PORTONE_WEBHOOK_SECRET.encode(),
        f"{ts}.".encode() + body,
        hashlib.sha256,
    ).hexdigest()
    return {"x-portone-signature": f"t={ts},v1={digest}"}


class TestFreeIssue:
    async def test_zero_price_immediate_issue(self, client, db):
        _, record, token = await _member(db)
        resp = await _request(client, token, record.id)
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == "issued"
        assert body["order_no"] is None  # 0원 — 결제 주문 없음
        assert body["certificate"]["issued_at"] is not None

        certs = await client.get("/api/me/certificates", cookies=member_cookie(token))
        assert certs.status_code == 200
        assert len(certs.json()) == 1
        cert = certs.json()[0]
        assert cert["status"] == "issued"
        assert cert["issue_type"] == "original"
        assert cert["certificate_no"].startswith("CERT-")


class TestPaidFlow:
    async def _setup_paid_request(self, client, db):
        _, record, token = await _member(db, price_original=5000)
        resp = await _request(client, token, record.id)
        assert resp.status_code == 201
        assert resp.json()["status"] == "payment_pending"
        return record, token, resp.json()

    async def test_confirm_issues_certificate(self, client, db, monkeypatch):
        async def fake_get(payment_id):
            return portone_payment(payment_id, total=5000)

        monkeypatch.setattr(portone, "get_payment", fake_get)
        _, token, req = await self._setup_paid_request(client, db)
        order_no = req["order_no"]

        resp = await client.post(
            f"/api/payments/{order_no}/confirm", cookies=member_cookie(token)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "paid"
        assert body["certificate"]["certificate_no"].startswith("CERT-")

    async def test_forged_amount_rejected(self, client, db, monkeypatch):
        async def fake_get(payment_id):
            return portone_payment(payment_id, total=100)  # 주문 5000원 → 위조 100원

        monkeypatch.setattr(portone, "get_payment", fake_get)
        _, token, req = await self._setup_paid_request(client, db)
        resp = await client.post(
            f"/api/payments/{req['order_no']}/confirm", cookies=member_cookie(token)
        )
        assert resp.status_code == 409
        assert resp.json()["code"] == "PAYMENT_AMOUNT_MISMATCH"

    async def test_store_mismatch_rejected(self, client, db, monkeypatch):
        async def fake_get(payment_id):
            return portone_payment(payment_id, total=5000, store_id="other-store")

        monkeypatch.setattr(portone, "get_payment", fake_get)
        _, token, req = await self._setup_paid_request(client, db)
        resp = await client.post(
            f"/api/payments/{req['order_no']}/confirm", cookies=member_cookie(token)
        )
        assert resp.status_code == 409
        assert resp.json()["code"] == "PAYMENT_STORE_MISMATCH"

    async def test_unpaid_rejected(self, client, db, monkeypatch):
        async def fake_get(payment_id):
            return portone_payment(payment_id, total=5000, status="READY")

        monkeypatch.setattr(portone, "get_payment", fake_get)
        _, token, req = await self._setup_paid_request(client, db)
        resp = await client.post(
            f"/api/payments/{req['order_no']}/confirm", cookies=member_cookie(token)
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "PAYMENT_NOT_PAID"

    async def test_confirm_idempotent(self, client, db, monkeypatch):
        async def fake_get(payment_id):
            return portone_payment(payment_id, total=5000)

        monkeypatch.setattr(portone, "get_payment", fake_get)
        _, token, req = await self._setup_paid_request(client, db)
        order_no = req["order_no"]
        first = await client.post(
            f"/api/payments/{order_no}/confirm", cookies=member_cookie(token)
        )
        assert first.status_code == 200
        second = await client.post(
            f"/api/payments/{order_no}/confirm", cookies=member_cookie(token)
        )
        assert second.status_code == 200
        assert second.json()["status"] == "paid"
        # 확인서는 1개만
        certs = await client.get("/api/me/certificates", cookies=member_cookie(token))
        assert len(certs.json()) == 1

    async def test_others_order_404(self, client, db, monkeypatch):
        _, _, req = await self._setup_paid_request(client, db)
        # 타인 세션으로 confirm — 소유 검증
        grade = await make_grade(db, code="g-other", name="타인등급")
        user2, _ = await make_trainee(
            db, grade.id, ci_raw="ci-other", trainee_no="TR-2026-0008"
        )
        token2 = await member_token(db, user2)
        await db.commit()
        resp = await client.post(
            f"/api/payments/{req['order_no']}/confirm", cookies=member_cookie(token2)
        )
        assert resp.status_code == 404


class TestWebhook:
    async def test_webhook_confirms_and_dedupes(self, client, db, monkeypatch):
        async def fake_get(payment_id):
            return portone_payment(payment_id, total=5000)

        monkeypatch.setattr(portone, "get_payment", fake_get)
        _, token, req_body = await self._mk_request(client, db)

        payload = {
            "webhookId": "wh-test-1",
            "type": "Transaction.Paid",
            "data": {"paymentId": req_body["order_no"]},
        }
        body = json.dumps(payload).encode()
        first = await client.post(
            "/api/payments/webhooks/portone",
            content=body,
            headers=_webhook_headers(body),
        )
        assert first.status_code == 200
        assert first.json() == {"ok": True, "order_found": True, "confirmed": True}

        certs = await client.get("/api/me/certificates", cookies=member_cookie(token))
        assert len(certs.json()) == 1

        replay = await client.post(
            "/api/payments/webhooks/portone",
            content=body,
            headers=_webhook_headers(body),
        )
        assert replay.status_code == 200
        assert replay.json() == {"ok": True, "duplicate": True}
        # 리플레이로 이중 발급 없음
        certs = await client.get("/api/me/certificates", cookies=member_cookie(token))
        assert len(certs.json()) == 1

    async def _mk_request(self, client, db):
        grade = await make_grade(db, code="g-wh", name="웹훅등급")
        user, trainee = await make_trainee(
            db, grade.id, ci_raw="ci-wh", trainee_no="TR-2026-0010"
        )
        record = await make_record(db, trainee.id, record_no="TRN-WH-0001")
        await make_pricing(db, grade.id, price_krw=5000)
        token = await member_token(db, user)
        await db.commit()
        resp = await _request(client, token, record.id)
        return trainee, token, resp.json()

    async def test_webhook_bad_signature_400(self, client, db):
        body = json.dumps({"webhookId": "wh-bad", "type": "t"}).encode()
        resp = await client.post(
            "/api/payments/webhooks/portone",
            content=body,
            headers={"x-portone-signature": "t=1,v1=deadbeef"},
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "WEBHOOK_SIGNATURE_INVALID"

    async def test_webhook_unknown_order_200(self, client, db):
        payload = {
            "webhookId": "wh-unknown",
            "type": "t",
            "data": {"paymentId": "ORD-XX"},
        }
        body = json.dumps(payload).encode()
        resp = await client.post(
            "/api/payments/webhooks/portone",
            content=body,
            headers=_webhook_headers(body),
        )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True, "order_found": False}


class TestReissue:
    async def test_original_blocked_after_issue(self, client, db):
        _, record, token = await _member(db)
        await _request(client, token, record.id)
        again = await _request(client, token, record.id)
        assert again.status_code == 409
        assert again.json()["code"] == "CERTIFICATE_ALREADY_ISSUED"

    async def test_reissue_supersedes_original(self, client, db, monkeypatch):
        async def fake_get(payment_id):
            return portone_payment(payment_id, total=5000)

        monkeypatch.setattr(portone, "get_payment", fake_get)
        _, record, token = await _member(db, price_original=0, price_reissue=5000)
        await _request(client, token, record.id)  # 최초 0원 발급

        reissue = await _request(client, token, record.id, issue_type="reissue")
        assert reissue.status_code == 201
        assert reissue.json()["status"] == "payment_pending"
        order_no = reissue.json()["order_no"]

        confirm = await client.post(
            f"/api/payments/{order_no}/confirm", cookies=member_cookie(token)
        )
        assert confirm.status_code == 200

        certs = (
            (await db.execute(select(Certificate).order_by(Certificate.issued_at)))
            .scalars()
            .all()
        )
        statuses = sorted(c.status for c in certs)
        assert statuses == ["issued", "superseded"]
        # 재발급 cert 가 issued
        issued = next(c for c in certs if c.status == "issued")
        assert issued.certificate_no != certs[0].certificate_no

        mine = await client.get("/api/me/certificates", cookies=member_cookie(token))
        issue_types = {c["issue_type"]: c["status"] for c in mine.json()}
        assert issue_types["original"] == "superseded"
        assert issue_types["reissue"] == "issued"
