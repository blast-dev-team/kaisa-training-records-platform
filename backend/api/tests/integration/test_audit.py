"""통합 — 감사 로그: 어드민 변경 작업이 audit_logs 에 actor·변경 내역과 함께 기록."""

from sqlalchemy import select

from app.domain.audit.model import AuditLog
from app.domain.certificate.model import Certificate
from app.domain.payment.model import PaymentOrder
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
            cookies=admin_cookie(admin_token),
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
            cookies=admin_cookie(admin_token),
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

        # 환불 — 이 결제로 발급된 확인서는 함께 폐기된다
        refund = await client.post(
            f"/api/payment-orders/{order.id}/refunds",
            json={"reason": "고객 요청"},
            cookies=admin_cookie(admin_token),
        )
        assert refund.status_code == 200
        assert refund.json()["status"] == "refunded"

        cert = (
            await db.execute(
                select(Certificate).where(Certificate.payment_order_id == order.id)
            )
        ).scalar_one()
        assert cert.status == "revoked"
        assert cert.revoked_at is not None

        rows = [
            r for r in await _audit_rows(db) if r.action == "payment_order.refunded"
        ]
        assert len(rows) == 1
        row = rows[0]
        assert row.entity_type == "payment_order"
        assert row.entity_id == order.id
        assert row.actor_admin_id == admin.id


class TestListSearch:
    async def test_q_matches_action_label_token_actor_and_content(self, client, db):
        """검색 — FE 가 라벨을 푼 원본 토큰(쉼표 구분)으로 액션·관리자명·변경 내용을 OR 검색."""
        old_grade = await make_grade(db, code="g-q-old", name="검색준회원", sort_order=1)
        new_grade = await make_grade(db, code="g-q-new", name="검색정회원", sort_order=2)
        _, trainee = await make_trainee(db, old_grade.id, ci_raw="ci-q", trainee_no="TR-2026-0033")
        admin, admin_token = await make_admin(db, email="q-admin@example.com")
        await db.commit()

        resp = await client.patch(
            f"/api/trainees/{trainee.id}",
            json={
                "membership_grade_id": str(new_grade.id),
                "grade_change_reason": "재심사",
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200

        # ① 액션 원본 토큰 (라벨 "수강생 등급 변경" → trainee.grade_changed)
        resp = await client.get(
            "/api/audit-logs", params={"q": "trainee.grade_changed"}, cookies=admin_cookie(admin_token)
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["action"] == "trainee.grade_changed"

        # ② 관리자명 부분 일치
        resp = await client.get(
            "/api/audit-logs", params={"q": "테스트 관리"}, cookies=admin_cookie(admin_token)
        )
        assert resp.status_code == 200
        assert all(i["actor_name"] == "테스트 관리자" for i in resp.json()["items"])
        assert len(resp.json()["items"]) >= 1

        # ③ 변경 내용(JSON) 부분 일치 — after_data 의 grade_id
        rows = [r for r in await _audit_rows(db) if r.action == "trainee.grade_changed"]
        resp = await client.get(
            "/api/audit-logs",
            params={"q": str(rows[0].after_data["grade_id"])},
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200
        assert any(i["action"] == "trainee.grade_changed" for i in resp.json()["items"])

        # ④ 쉼표 다중 토큰 OR — 하나라도 걸리면 포함, 안 걸리는 토큰은 무해
        resp = await client.get(
            "/api/audit-logs",
            params={"q": "no-such-token,trainee.grade_changed"},
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200
        assert any(i["action"] == "trainee.grade_changed" for i in resp.json()["items"])

        # ⑤ 안 걸리는 검색어 → 빈 결과
        resp = await client.get(
            "/api/audit-logs", params={"q": "no-such-token"}, cookies=admin_cookie(admin_token)
        )
        assert resp.status_code == 200
        assert resp.json()["items"] == []
