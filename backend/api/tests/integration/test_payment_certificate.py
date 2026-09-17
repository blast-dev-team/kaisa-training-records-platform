"""통합 — 확인서 신청 → 결제 confirm → 발급 + 웹훅 멱급 + 재발급."""

import hashlib
import hmac
import json
import time
import uuid

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


async def _member(db, *, price=0):
    grade = await make_grade(db, code="g-pay", name="결제등급")
    user, trainee = await make_trainee(
        db, grade.id, ci_raw="ci-pay", trainee_no="TR-2026-0007"
    )
    record = await make_record(db, trainee.id, record_no="TRN-PAY-0001")
    await make_pricing(db, grade.id, price_krw=price)
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
        _, record, token = await _member(db, price=5000)
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

    async def _backdate_last_issue(self, db, days: int) -> None:
        """직전 발급일을 N일 전으로 — 무료 재발급 기간(7일) 경과를 시뮬레이션."""
        from datetime import timedelta

        from app.core.kst import now_kst

        certs = (await db.execute(select(Certificate))).scalars().all()
        for cert in certs:
            cert.issued_at = now_kst() - timedelta(days=days)
        await db.commit()

    async def test_reissue_free_within_seven_days(self, client, db):
        """직전 발급 7일 이내 — 재발급 0원, 결제 없이 즉시 발급."""
        _, record, token = await _member(db)
        await _request(client, token, record.id)  # 최초 0원 발급 — 지금 막 발급됨

        reissue = await _request(client, token, record.id, issue_type="reissue")
        assert reissue.status_code == 201
        assert reissue.json()["status"] == "issued"
        assert reissue.json()["amount_krw"] == 0
        assert reissue.json()["order_no"] is None

    async def test_reissue_supersedes_original(self, client, db, monkeypatch):
        async def fake_get(payment_id):
            return portone_payment(payment_id, total=5000)

        monkeypatch.setattr(portone, "get_payment", fake_get)
        _, record, token = await _member(db, price=5000)

        # 최초 유료 발급 — 결제까지 완료
        first = await _request(client, token, record.id)
        assert first.status_code == 201
        assert first.json()["status"] == "payment_pending"
        first_confirm = await client.post(
            f"/api/payments/{first.json()['order_no']}/confirm",
            cookies=member_cookie(token),
        )
        assert first_confirm.status_code == 200

        await self._backdate_last_issue(db, days=8)  # 무료 기간(7일) 경과

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


class TestBatchFlow:
    """다건 발급 — 유효 신청들이 하나의 결제 주문으로 묶인다."""

    async def _batch(self, client, token, record_ids, issue_type="original"):
        """record_ids 가 str이면 공통 issue_type, (id, issue_type) 튜플이면 건별 지정."""
        items = [
            {"training_record_id": str(record_id), "issue_type": issue_type}
            if isinstance(record_id, uuid.UUID)
            else {
                "training_record_id": str(record_id[0]),
                "issue_type": record_id[1],
            }
            for record_id in record_ids
        ]
        return await client.post(
            "/api/certificate-requests/batch",
            json={"items": items},
            cookies=member_cookie(token),
        )

    async def test_one_order_covers_all(self, client, db, monkeypatch):
        async def fake_get(payment_id):
            return portone_payment(payment_id, total=5000)  # 단 건·일괄 동일 요금

        monkeypatch.setattr(portone, "get_payment", fake_get)
        trainee, record, token = await _member(db, price=5000)
        other = await make_record(db, trainee.id, record_no="TRN-PAY-0002")
        await db.commit()

        resp = await self._batch(client, token, [record.id, other.id])
        assert resp.status_code == 201
        requests = resp.json()
        assert len(requests) == 2
        # 같은 주문 — 청구는 단가 1회(5,000원), 각 신청 스냅샷은 5,000원
        assert requests[0]["order_no"] == requests[1]["order_no"]
        assert all(r["status"] == "payment_pending" for r in requests)
        assert all(r["amount_krw"] == 5000 for r in requests)

        confirm = await client.post(
            f"/api/payments/{requests[0]['order_no']}/confirm",
            cookies=member_cookie(token),
        )
        assert confirm.status_code == 200
        body = confirm.json()
        assert len(body["certificates"]) == 2
        assert body["certificates"][0]["certificate_no"].startswith("CERT-")

        mine = await client.get(
            "/api/me/certificates", cookies=member_cookie(token)
        )
        assert len(mine.json()) == 2

    async def test_zero_price_issues_immediately(self, client, db):
        trainee, record, token = await _member(db)  # 0원
        other = await make_record(db, trainee.id, record_no="TRN-PAY-0003")
        await db.commit()

        resp = await self._batch(client, token, [record.id, other.id])
        assert resp.status_code == 201
        requests = resp.json()
        assert all(r["status"] == "issued" for r in requests)
        assert all(r["order_no"] is None for r in requests)

    async def test_invalid_record_rejects_all(self, client, db):
        trainee, record, token = await _member(db)
        pending = await make_record(
            db, trainee.id, completion_status="in_progress", record_no="TRN-PAY-0004"
        )
        await db.commit()

        resp = await self._batch(client, token, [record.id, pending.id])
        assert resp.status_code == 422
        assert resp.json()["code"] == "VALIDATION_ERROR"

        mine = await client.get(
            "/api/me/certificate-requests", cookies=member_cookie(token)
        )
        assert mine.json() == []  # 원자성 — 유효한 건도 생성되지 않는다

    async def test_duplicate_records_rejected(self, client, db):
        _, record, token = await _member(db)
        resp = await self._batch(client, token, [record.id, record.id])
        assert resp.status_code == 422
        assert resp.json()["code"] == "VALIDATION_ERROR"

    async def test_mixed_free_reissue_groups_into_one_order(self, client, db, monkeypatch):
        """유료 신규 발급 + 7일 내 무료 재발급 혼합 — 주문 금액은 유료분만."""
        async def fake_get(payment_id):
            return portone_payment(payment_id, total=5000)

        monkeypatch.setattr(portone, "get_payment", fake_get)
        trainee, record_a, token = await _member(db, price=5000)
        record_b = await make_record(db, trainee.id, record_no="TRN-PAY-0005")
        await db.commit()

        # record_b 를 먼저 발급 → 지금 막 발급됐으니 재발급은 무료
        first = await _request(client, token, record_b.id)
        assert first.status_code == 201
        confirm_first = await client.post(
            f"/api/payments/{first.json()['order_no']}/confirm",
            cookies=member_cookie(token),
        )
        assert confirm_first.status_code == 200

        resp = await self._batch(
            client,
            token,
            [(record_a.id, "original"), (record_b.id, "reissue")],
        )
        assert resp.status_code == 201, resp.json()
        requests = resp.json()
        by_record = {r["training_record_id"]: r for r in requests}
        assert by_record[str(record_a.id)]["amount_krw"] == 5000
        assert by_record[str(record_b.id)]["amount_krw"] == 0  # 무료 재발급
        # 주문은 하나 — 유료분 5,000원만 청구
        assert requests[0]["order_no"] == requests[1]["order_no"]

        confirm = await client.post(
            f"/api/payments/{requests[0]['order_no']}/confirm",
            cookies=member_cookie(token),
        )
        assert confirm.status_code == 200
        assert len(confirm.json()["certificates"]) == 2

    async def test_record_older_than_three_years_rejected(self, client, db):
        from datetime import timedelta

        from app.core.kst import today_kst

        _, record, token = await _member(db)
        record.started_at = today_kst() - timedelta(days=3 * 365 + 1)
        await db.commit()

        resp = await _request(client, token, record.id)
        assert resp.status_code == 422
        assert resp.json()["code"] == "VALIDATION_ERROR"
        assert "3년" in resp.json()["message"]


class TestDemoRecordIssuance:
    """공용 데모 이력 — 모든 회원이 발급 가능하고 발급 상태는 회원별로 분리된다."""

    async def _setup_demo(self, db, *, price=0):
        grade = await make_grade(db, code="g-demo", name="데모등급")
        user_a, trainee_a = await make_trainee(
            db, grade.id, ci_raw="ci-demo-a", trainee_no="TR-2026-0008"
        )
        user_b, _ = await make_trainee(
            db, grade.id, ci_raw="ci-demo-b", trainee_no="TR-2026-0009"
        )
        record = await make_record(db, trainee_a.id, record_no="TRN-DEMO-0001")
        record.is_demo = True
        await make_pricing(db, grade.id, price_krw=price)
        token_a = await member_token(db, user_a)
        token_b = await member_token(db, user_b)
        await db.commit()
        return record, token_a, token_b

    async def test_demo_record_issuable_by_any_trainee(self, client, db):
        """소유 trainee가 아닌 회원도 데모 이력 발급 신청이 가능하다."""
        record, _, token_b = await self._setup_demo(db)
        resp = await _request(client, token_b, record.id)
        assert resp.status_code == 201, resp.json()
        assert resp.json()["status"] == "issued"

    async def test_issuance_scoped_per_trainee(self, client, db):
        """A가 발급한 데모 이력도 B가 발급할 수 있다 — active cert 는 회원별."""
        record, token_a, token_b = await self._setup_demo(db)
        first = await _request(client, token_a, record.id)
        assert first.status_code == 201

        second = await _request(client, token_b, record.id)
        assert second.status_code == 201, second.json()

        # A의 무료 재발급은 A의 직전 발급 기준 — B 발급과 무관
        reissue = await _request(client, token_a, record.id, issue_type="reissue")
        assert reissue.status_code == 201
        assert reissue.json()["amount_krw"] == 0

    async def test_me_records_reflect_certificate_status(self, client, db):
        """교육이력 목록 — 발급 전 issuable, 발급 후 reissuable + 무료 기한."""
        record, token_a, _ = await self._setup_demo(db)

        before = await client.get(
            "/api/me/training-records", cookies=member_cookie(token_a)
        )
        items = {i["id"]: i for i in before.json()["items"]}
        assert items[str(record.id)]["certificate_status"] == "issuable"

        await _request(client, token_a, record.id)

        after = await client.get(
            "/api/me/training-records", cookies=member_cookie(token_a)
        )
        items = {i["id"]: i for i in after.json()["items"]}
        assert items[str(record.id)]["certificate_status"] == "reissuable"
        assert items[str(record.id)]["reissue_free_until"] is not None


class TestPaymentHistory:
    """회원 결제 내역 — 결제완료·환불 주문만, 주문 단위 조립."""

    async def _pay_one(self, client, db, monkeypatch, *, price=3000):
        async def fake_get(payment_id):
            return {
                "id": payment_id,
                "status": "PAID",
                "amount": {"total": price, "currency": "KRW"},
                "method": {"type": "CARD"},
                "receiptUrl": "https://receipt.example/1",
            }

        monkeypatch.setattr(portone, "get_payment", fake_get)
        _, record, token = await _member(db, price=price)
        resp = await _request(client, token, record.id)
        assert resp.status_code == 201
        order_no = resp.json()["order_no"]
        confirm = await client.post(
            f"/api/payments/{order_no}/confirm",
            cookies=member_cookie(token),
        )
        assert confirm.status_code == 200
        return record, token

    async def test_lists_paid_order_with_certificate(self, client, db, monkeypatch):
        record, token = await self._pay_one(client, db, monkeypatch)

        resp = await client.get(
            "/api/me/payment-history", cookies=member_cookie(token)
        )
        assert resp.status_code == 200, resp.json()
        body = resp.json()
        assert body["total"] == 1
        item = body["items"][0]
        assert item["amount_krw"] == 3000
        assert item["status"] == "paid"
        assert item["course_name"] == record.course_name
        assert item["certificate_no"] is not None
        assert item["method"] == "카드"
        assert item["receipt_url"] == "https://receipt.example/1"
        assert item["paid_at"] is not None

    async def test_method_label_variants(self, client, db, monkeypatch):
        """PortOne method.type 형식이 제각각이어도 한국어 라벨로 정규화된다."""
        async def fake_get(payment_id):
            return {
                "id": payment_id,
                "status": "PAID",
                "amount": {"total": 3000, "currency": "KRW"},
                "method": {"type": "PaymentMethodEasyPay"},
                "receiptUrl": None,
            }

        monkeypatch.setattr(portone, "get_payment", fake_get)
        _, record, token = await _member(db, price=3000)
        resp = await _request(client, token, record.id)
        order_no = resp.json()["order_no"]
        await client.post(
            f"/api/payments/{order_no}/confirm",
            cookies=member_cookie(token),
        )

        history = await client.get(
            "/api/me/payment-history", cookies=member_cookie(token)
        )
        assert history.json()["items"][0]["method"] == "간편결제"

    async def test_excludes_pending_orders(self, client, db):
        grade = await make_grade(db, code="g-hist", name="내역등급")
        user, trainee = await make_trainee(
            db, grade.id, ci_raw="ci-hist", trainee_no="TR-2026-0010"
        )
        record = await make_record(db, trainee.id, record_no="TRN-HIST-0001")
        await make_pricing(db, grade.id, price_krw=3000)
        token = await member_token(db, user)
        await db.commit()

        # 결제 대기 주문 — 결제 전이라 내역에서 제외
        resp = await _request(client, token, record.id)
        assert resp.status_code == 201
        assert resp.json()["status"] == "payment_pending"

        history = await client.get(
            "/api/me/payment-history", cookies=member_cookie(token)
        )
        assert history.status_code == 200
        assert history.json()["total"] == 0

    async def test_status_and_period_filters(self, client, db, monkeypatch):
        _, token = await self._pay_one(client, db, monkeypatch)

        paid = await client.get(
            "/api/me/payment-history?status=paid", cookies=member_cookie(token)
        )
        assert paid.json()["total"] == 1
        refunded = await client.get(
            "/api/me/payment-history?status=refunded", cookies=member_cookie(token)
        )
        assert refunded.json()["total"] == 0
        future = await client.get(
            "/api/me/payment-history?from=2999-01-01",
            cookies=member_cookie(token),
        )
        assert future.json()["total"] == 0
