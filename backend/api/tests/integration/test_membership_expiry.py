"""통합 — 연간 회원 기간(만료일): 지정 검증 + 기간 만료 자동 일반 전환."""

from datetime import timedelta

from sqlalchemy import select

from app.core.kst import today_kst
from app.domain.trainee.model import Trainee, TraineeGradeHistory
from app.domain.trainee.service import trainee_service
from tests.integration.helpers import admin_cookie, make_admin, make_grade, make_trainee


async def _set_expiry(db, trainee: Trainee, expires) -> None:
    trainee.grade_expires_at = expires
    await db.flush()


class TestExpireDueMemberships:
    async def test_expired_annual_downgrades_to_general_with_history(self, client, db):
        general = await make_grade(db, code="general", name="일반")
        annual = await make_grade(db, code="annual", name="연간")
        _, trainee = await make_trainee(
            db, annual.id, ci_raw="ci-exp1", trainee_no="TR-E-0001"
        )
        await _set_expiry(db, trainee, today_kst() - timedelta(days=1))
        await make_admin(db)
        await db.commit()

        changed = await trainee_service.expire_due_memberships(db)
        assert changed == 1

        row = (
            await db.execute(
                select(Trainee)
                .where(Trainee.id == trainee.id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        assert row.membership_grade_id == general.id
        assert row.grade_expires_at is None

        history = (
            await db.execute(
                select(TraineeGradeHistory).where(
                    TraineeGradeHistory.trainee_id == trainee.id
                )
            )
        ).scalars().all()
        assert len(history) == 1
        assert history[0].previous_grade_id == annual.id
        assert history[0].new_grade_id == general.id
        assert history[0].change_reason == trainee_service.AUTO_DOWNGRADE_REASON
        assert history[0].changed_by is None  # 시스템 자동 전환

        # 재실행 — 이미 전환돼 중복 이력이 생기지 않는다
        assert await trainee_service.expire_due_memberships(db) == 0

    async def test_admin_list_endpoint_triggers_sweep(self, client, db):
        general = await make_grade(db, code="general", name="일반")
        annual = await make_grade(db, code="annual", name="연간")
        _, trainee = await make_trainee(
            db, annual.id, ci_raw="ci-exp2", trainee_no="TR-E-0002"
        )
        await _set_expiry(db, trainee, today_kst() - timedelta(days=3))
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.get(
            "/api/trainees", cookies=admin_cookie(admin_token)
        )
        assert resp.status_code == 200
        item = next(i for i in resp.json()["items"] if i["id"] == str(trainee.id))
        assert item["membership_grade_id"] == str(general.id)
        assert item["grade_expires_at"] is None

    async def test_expiry_today_is_still_active(self, db):
        general = await make_grade(db, code="general", name="일반")
        annual = await make_grade(db, code="annual", name="연간")
        _, trainee = await make_trainee(
            db, annual.id, ci_raw="ci-exp3", trainee_no="TR-E-0003"
        )
        await _set_expiry(db, trainee, today_kst())  # 당일까지 유효
        await db.commit()

        assert await trainee_service.expire_due_memberships(db) == 0
        row = (
            await db.execute(
                select(Trainee)
                .where(Trainee.id == trainee.id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        assert row.membership_grade_id == annual.id
        assert row.grade_expires_at == today_kst()
        assert general is not None  # 스윕 대상 아님 확인용


class TestGradeExpiryValidation:
    async def test_assign_annual_without_expiry_422(self, client, db):
        grade = await make_grade(db, code="g-lt", name="평생")
        annual = await make_grade(db, code="annual", name="연간")
        _, trainee = await make_trainee(
            db, grade.id, ci_raw="ci-exp4", trainee_no="TR-E-0004"
        )
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.patch(
            f"/api/trainees/{trainee.id}",
            json={"membership_grade_id": str(annual.id)},
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "VALIDATION_ERROR"

    async def test_assign_annual_with_expiry_sets_date(self, client, db):
        annual = await make_grade(db, code="annual", name="연간")
        _, trainee = await make_trainee(
            db, None, ci_raw="ci-exp5", trainee_no="TR-E-0005"
        )
        _, admin_token = await make_admin(db)
        await db.commit()
        expires = str(today_kst() + timedelta(days=365))

        resp = await client.patch(
            f"/api/trainees/{trainee.id}",
            json={
                "membership_grade_id": str(annual.id),
                "grade_expires_at": expires,
                "grade_change_reason": "연간 결제",
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["grade_expires_at"] == expires

    async def test_switch_off_annual_clears_expiry(self, client, db):
        annual = await make_grade(db, code="annual", name="연간")
        lifetime = await make_grade(db, code="g-lt2", name="평생")
        _, trainee = await make_trainee(
            db, annual.id, ci_raw="ci-exp6", trainee_no="TR-E-0006"
        )
        await _set_expiry(db, trainee, today_kst() + timedelta(days=30))
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.patch(
            f"/api/trainees/{trainee.id}",
            json={
                "membership_grade_id": str(lifetime.id),
                "grade_expires_at": str(today_kst() + timedelta(days=99)),  # 무시돼야 함
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["membership_grade_id"] == str(lifetime.id)
        assert body["grade_expires_at"] is None

    async def test_extend_expiry_same_grade_updates_date_without_history(self, client, db):
        annual = await make_grade(db, code="annual", name="연간")
        _, trainee = await make_trainee(
            db, annual.id, ci_raw="ci-exp7", trainee_no="TR-E-0007"
        )
        old = today_kst() + timedelta(days=30)
        await _set_expiry(db, trainee, old)
        _, admin_token = await make_admin(db)
        await db.commit()
        new = str(today_kst() + timedelta(days=365))

        resp = await client.patch(
            f"/api/trainees/{trainee.id}",
            json={
                "membership_grade_id": str(annual.id),  # 같은 등급 + 연장
                "grade_expires_at": new,
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["grade_expires_at"] == new

        history = (
            await db.execute(
                select(TraineeGradeHistory).where(
                    TraineeGradeHistory.trainee_id == trainee.id
                )
            )
        ).scalars().all()
        assert history == []  # 등급이 바뀌지 않으면 이력 없음

    async def test_bulk_grade_to_annual_requires_expiry(self, client, db):
        grade = await make_grade(db, code="g-lt3", name="평생")
        annual = await make_grade(db, code="annual", name="연간")
        _, trainee = await make_trainee(
            db, grade.id, ci_raw="ci-exp8", trainee_no="TR-E-0008"
        )
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.post(
            "/api/trainees/bulk-grade",
            json={
                "trainee_ids": [str(trainee.id)],
                "membership_grade_id": str(annual.id),
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 422

    async def test_bulk_grade_to_annual_with_expiry_applies_to_all(self, client, db):
        annual = await make_grade(db, code="annual", name="연간")
        _, t1 = await make_trainee(db, None, ci_raw="ci-exp9", trainee_no="TR-E-0009")
        _, t2 = await make_trainee(db, None, ci_raw="ci-exp10", trainee_no="TR-E-0010")
        _, admin_token = await make_admin(db)
        await db.commit()
        expires = str(today_kst() + timedelta(days=180))

        resp = await client.post(
            "/api/trainees/bulk-grade",
            json={
                "trainee_ids": [str(t1.id), str(t2.id)],
                "membership_grade_id": str(annual.id),
                "grade_expires_at": expires,
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json() == {"updated": 2, "skipped": 0}

        rows = (
            await db.execute(
                select(Trainee)
                .where(Trainee.id.in_([t1.id, t2.id]))
                .execution_options(populate_existing=True)
            )
        ).scalars().all()
        assert all(r.grade_expires_at.isoformat() == expires for r in rows)
