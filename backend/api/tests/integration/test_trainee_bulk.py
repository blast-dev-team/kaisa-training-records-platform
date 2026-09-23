"""통합 — 교육생 일괄 처리: 등급 일괄 변경 + 기본정보 일괄 수정."""

from sqlalchemy import select

from app.core.crypto import decrypt_field
from app.core.kst import now_kst
from app.domain.trainee.model import Trainee, TraineeGradeHistory
from tests.integration.helpers import admin_cookie, make_admin, make_grade, make_trainee


class TestBulkGrade:
    async def test_bulk_grade_updates_and_skips_same_grade(self, client, db):
        grade_a = await make_grade(db, code="g-ba", name="일반")
        grade_b = await make_grade(db, code="g-bb", name="평생")
        _, t1 = await make_trainee(db, grade_a.id, ci_raw="ci-ba1", trainee_no="TR-B-0001")
        _, t2 = await make_trainee(
            db, grade_b.id, ci_raw="ci-ba2", trainee_no="TR-B-0002"
        )  # 이미 대상 등급
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.post(
            "/api/trainees/bulk-grade",
            json={
                "trainee_ids": [str(t1.id), str(t2.id)],
                "membership_grade_id": str(grade_b.id),
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json() == {"updated": 1, "skipped": 1}

        # populate_existing — expire_on_commit=False 라 identity map 이 스태일값을 준다
        row = (
            await db.execute(
                select(TraineeGradeHistory)
                .where(TraineeGradeHistory.trainee_id == t1.id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        assert row.previous_grade_id == grade_a.id
        assert row.new_grade_id == grade_b.id
        assert row.change_reason is None  # 일괄 변경은 사유 없음
        assert row.changed_by is not None

        # 같은 등급이던 t2 에는 이력이 생기지 않는다
        t2_history = (
            await db.execute(
                select(TraineeGradeHistory).where(TraineeGradeHistory.trainee_id == t2.id)
            )
        ).scalars().all()
        assert t2_history == []

    async def test_bulk_grade_unknown_grade_404(self, client, db):
        import uuid

        grade = await make_grade(db, code="g-bu", name="미발견등급")
        _, trainee = await make_trainee(db, grade.id, ci_raw="ci-bu", trainee_no="TR-B-0003")
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.post(
            "/api/trainees/bulk-grade",
            json={
                "trainee_ids": [str(trainee.id)],
                "membership_grade_id": str(uuid.uuid4()),
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 404

        row = (
            await db.execute(select(Trainee).where(Trainee.id == trainee.id))
        ).scalar_one()
        assert row.membership_grade_id == grade.id  # 무변화

    async def test_bulk_grade_skips_missing_and_deleted(self, client, db):
        import uuid

        grade_a = await make_grade(db, code="g-bs", name="건너뜀등급A")
        grade_b = await make_grade(db, code="g-bs2", name="건너뜀등급B")
        _, deleted = await make_trainee(
            db, grade_a.id, ci_raw="ci-bs1", trainee_no="TR-B-0004"
        )
        deleted.deleted_at = now_kst()
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.post(
            "/api/trainees/bulk-grade",
            json={
                "trainee_ids": [str(uuid.uuid4()), str(deleted.id)],
                "membership_grade_id": str(grade_b.id),
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json() == {"updated": 0, "skipped": 2}


class TestBulkUpdate:
    async def test_bulk_update_applies_fields_and_keeps_omitted_phone(self, client, db):
        grade = await make_grade(db, code="g-c1", name="수정등급")
        _, t1 = await make_trainee(db, grade.id, ci_raw="ci-c1", trainee_no="TR-C-0001")
        _, t2 = await make_trainee(db, grade.id, ci_raw="ci-c2", trainee_no="TR-C-0002")
        t2.cert_no = "2026-0002"
        original_encrypted = t2.phone_encrypted
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.post(
            "/api/trainees/bulk-update",
            json={
                "items": [
                    {
                        "id": str(t1.id),
                        "name": "김이박",
                        "birth_date": "1990-01-02",
                        "phone": "01099998888",
                        "cert_no": "2026-1111",
                    },
                    {
                        "id": str(t2.id),
                        "name": "최정아",
                        # phone 키 생략 → 기존 번호 유지
                    },
                ]
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json() == {"updated": 2, "skipped": 0}

        # populate_existing — expire_on_commit=False 라 identity map 이 스태일값을 준다
        row1 = (
            await db.execute(
                select(Trainee)
                .where(Trainee.id == t1.id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        assert decrypt_field(row1.name_encrypted) == "김이박"
        assert str(row1.birth_date) == "1990-01-02"
        assert decrypt_field(row1.phone_encrypted) == "01099998888"
        assert row1.cert_no == "2026-1111"

        row2 = (
            await db.execute(
                select(Trainee)
                .where(Trainee.id == t2.id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        assert decrypt_field(row2.name_encrypted) == "최정아"
        assert row2.phone_encrypted == original_encrypted
        assert row2.cert_no == "2026-0002"  # cert_no 키 생략 → 기존 번호 유지

    async def test_bulk_update_validation_and_auth(self, client, db):
        grade = await make_grade(db, code="g-c2", name="검증등급")
        _, trainee = await make_trainee(db, grade.id, ci_raw="ci-c3", trainee_no="TR-C-0003")
        _, admin_token = await make_admin(db)
        await db.commit()

        # 빈 items → 422
        resp = await client.post(
            "/api/trainees/bulk-update",
            json={"items": []},
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 422

        # 빈 trainee_ids → 422
        resp = await client.post(
            "/api/trainees/bulk-grade",
            json={"trainee_ids": [], "membership_grade_id": str(grade.id)},
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 422

        # 비인증 → 401
        resp = await client.post(
            "/api/trainees/bulk-update",
            json={"items": [{"id": str(trainee.id), "name": "x"}]},
        )
        assert resp.status_code == 401
