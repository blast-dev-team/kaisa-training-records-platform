"""통합 — 감사 로그: 어드민 변경 작업이 audit_logs 에 actor·변경 내역과 함께 기록."""

from sqlalchemy import select

from app.domain.audit.model import AuditLog
from app.domain.certificate.model import Certificate
from app.domain.payment.model import PaymentOrder
from app.integrations import portone
from tests.integration.helpers import (
    make_admin,
    make_grade,
    make_pricing,
    make_record,
    make_trainee,
    member_cookie,
    member_token,
    portone_payment,
)


async def _audit_rows(db) -> list[AuditLog]:
    return list((await db.execute(select(AuditLog))).scalars().all())


class TestGradeChangeAudit:
    async def test_grade_change_recorded_with_actor_and_reason(self, client, db):
        old_grade = await make_grade(db, code="g-old", name="준회원", sort_order=1)
        new_grade = await make_grade(db, code="g-new", name="정회원", sort_order=2)
        _, trainee = await make_trainee(
            db, old_grade.id, ci_raw="ci-audit", trainee_no="TR-2026-0030"
        )
        admin, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.patch(
            f"/api/trainees/{trainee.id}",
            json={
                "membership_grade_id": str(new_grade.id),
                "grade_change_reason": "승급 심사 완료",
            },
            cookies=member_cookie(admin_token),
        )
        assert resp.status_code == 200

        rows = [r for r in await _audit_rows(db) if r.action == "trainee.grade_changed"]
        assert len(rows) == 1
        row = rows[0]
        assert row.entity_type == "trainee"
        assert row.entity_id == trainee.id
        assert row.actor_admin_id == admin.id
        # 변경 전/후 스냅샷 — 등급 id 로 기록
        assert row.before_data and row.after_data
        assert row.before_data["grade_id"] == str(old_grade.id)
        assert row.after_data["grade_id"] == str(new_grade.id)

        # 회원 본인 세션으로는 audit 미기록 — 어드민 작업만 감사 대상
        member_rows = [r for r in await _audit_rows(db) if r.actor_admin_id != admin.id]
        assert member_rows == []


class TestRevokeAudit:
    async def test_revoke_recorded(self, client, db):
        grade = await make_grade(db, code="g-rv", name="취소등급")
        user, trainee = await make_trainee(
            db, grade.id, ci_raw="ci-rv", trainee_no="TR-2026-0031"
        )
        record = await make_record(db, trainee.id, record_no="TRN-RV-0001")
        await make_pricing(db, grade.id)
        admin, admin_token = await make_admin(db)
        token = await member_token(db, user)
        await db.commit()

        req = await client.post(
            "/api/certificate-requests",
            json={"training_record_id": str(record.id), "issue_type": "original"},
            cookies=member_cookie(token),
        )
        assert req.status_code == 201
        cert = (
            await db.execute(select(Certificate).where(Certificate.status == "issued"))
        ).scalar_one()

        revoke = await client.post(
            f"/api/certificates/{cert.id}/revoke",
            json={"reason": "오발급"},
            cookies=member_cookie(admin_token),
        )
        assert revoke.status_code == 200

        rows = [r for r in await _audit_rows(db) if r.action == "certificate.revoked"]
        assert len(rows) == 1
        row = rows[0]
        assert row.entity_id == cert.id
        assert row.actor_admin_id == admin.id


class TestRefundAudit:
    async def test_refund_recorded(self, client, db, monkeypatch):
        async def fake_get(payment_id):
            return portone_payment(payment_id, total=5000)

        monkeypatch.setattr(portone, "get_payment", fake_get)

        async def fake_cancel(payment_id, reason):
            return {"id": payment_id, "status": "CANCELLED"}

        monkeypatch.setattr(portone, "cancel_payment", fake_cancel)
        grade = await make_grade(db, code="g-rf", name="환불등급")
        user, trainee = await make_trainee(
            db, grade.id, ci_raw="ci-rf", trainee_no="TR-2026-0032"
        )
        record = await make_record(db, trainee.id, record_no="TRN-RF-0001")
        await make_pricing(db, grade.id, price_krw=5000)
        admin, admin_token = await make_admin(db)
        token = await member_token(db, user)
        await db.commit()

        req = await client.post(
            "/api/certificate-requests",
            json={"training_record_id": str(record.id), "issue_type": "original"},
            cookies=member_cookie(token),
        )
        order_no = req.json()["order_no"]
        confirm = await client.post(
            f"/api/payments/{order_no}/confirm", cookies=member_cookie(token)
        )
        assert confirm.status_code == 200
        order = (
            await db.execute(
                select(PaymentOrder).where(PaymentOrder.order_no == order_no)
            )
        ).scalar_one()

        refund = await client.post(
            f"/api/payment-orders/{order.id}/refunds",
            json={"reason": "고객 요청"},
            cookies=member_cookie(admin_token),
        )
        assert refund.status_code == 200
        assert refund.json()["status"] == "refunded"

        rows = [
            r for r in await _audit_rows(db) if r.action == "payment_order.refunded"
        ]
        assert len(rows) == 1
        row = rows[0]
        assert row.entity_type == "payment_order"
        assert row.entity_id == order.id
        assert row.actor_admin_id == admin.id
