"""통합 — 교육생 소프트딜리트: 진행 중 작업 차단 + 삭제 후 활성 조회 숨김."""

from datetime import datetime

from sqlalchemy import select

from app.core.kst import now_kst
from app.domain.certificate.model import CertificateRequest
from app.domain.payment.model import PaymentOrder
from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_record,
    make_trainee,
    member_cookie,
    member_token,
)


async def _make_pending_request(db, user, trainee, record, grade_id) -> None:
    db.add(
        CertificateRequest(
            request_no="REQ-DEL-0001",
            trainee_id=trainee.id,
            training_record_id=record.id,
            requested_by=user.id,
            issue_type="original",
            membership_grade_id=grade_id,
            amount_krw=0,
            status="pending",
            requested_at=now_kst(),
        )
    )
    await db.flush()


async def _make_unpaid_order(db, trainee) -> None:
    db.add(
        PaymentOrder(
            order_no="ORD-DEL-0001",
            trainee_id=trainee.id,
            amount_krw=3000,
            status="ready",
        )
    )
    await db.flush()


class TestTraineeDelete:
    async def test_delete_204_and_hidden_from_list_and_detail(self, client, db):
        from app.domain.trainee.model import Trainee

        grade = await make_grade(db, code="g-del", name="삭제등급")
        _, trainee = await make_trainee(
            db, grade.id, ci_raw="ci-del", trainee_no="TR-2026-0100"
        )
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.delete(
            f"/api/trainees/{trainee.id}", cookies=admin_cookie(admin_token)
        )
        assert resp.status_code == 204

        row = (
            await db.execute(select(Trainee).where(Trainee.id == trainee.id))
        ).scalar_one()
        assert isinstance(row.deleted_at, datetime)

        # 목록·상세에서 숨김
        lst = await client.get("/api/trainees", cookies=admin_cookie(admin_token))
        assert lst.status_code == 200
        assert all(item["id"] != str(trainee.id) for item in lst.json()["items"])

        detail = await client.get(
            f"/api/trainees/{trainee.id}", cookies=admin_cookie(admin_token)
        )
        assert detail.status_code == 404

    async def test_delete_blocked_by_pending_request(self, client, db):
        grade = await make_grade(db, code="g-blk1", name="차단등급1")
        user, trainee = await make_trainee(
            db, grade.id, ci_raw="ci-blk1", trainee_no="TR-2026-0101"
        )
        record = await make_record(db, trainee.id, record_no="TRN-DEL-0001")
        await _make_pending_request(db, user, trainee, record, grade.id)
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.delete(
            f"/api/trainees/{trainee.id}", cookies=admin_cookie(admin_token)
        )
        assert resp.status_code == 409
        assert resp.json()["code"] == "TRAINEE_HAS_PENDING_WORK"

    async def test_delete_blocked_by_unpaid_order(self, client, db):
        grade = await make_grade(db, code="g-blk2", name="차단등급2")
        _, trainee = await make_trainee(
            db, grade.id, ci_raw="ci-blk2", trainee_no="TR-2026-0102"
        )
        await _make_unpaid_order(db, trainee)
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.delete(
            f"/api/trainees/{trainee.id}", cookies=admin_cookie(admin_token)
        )
        assert resp.status_code == 409
        assert resp.json()["code"] == "TRAINEE_HAS_PENDING_WORK"

    async def test_deleted_trainee_member_session_unlinked(self, client, db):
        grade = await make_grade(db, code="g-lnk", name="연결등급")
        user, trainee = await make_trainee(
            db, grade.id, ci_raw="ci-lnk", trainee_no="TR-2026-0103"
        )
        _, admin_token = await make_admin(db)
        token = await member_token(db, user)
        await db.commit()

        assert (
            await client.get("/api/me/profile", cookies=member_cookie(token))
        ).status_code == 200

        resp = await client.delete(
            f"/api/trainees/{trainee.id}", cookies=admin_cookie(admin_token)
        )
        assert resp.status_code == 204

        # 삭제된 교육생 — 회원 세션은 미연결로 본다 (row 는 남아 이력 보존)
        profile = await client.get("/api/me/profile", cookies=member_cookie(token))
        assert profile.status_code == 403
        assert profile.json()["code"] == "TRAINEE_NOT_LINKED"
