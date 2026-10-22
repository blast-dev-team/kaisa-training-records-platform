"""통합 — KAISA 계정(성명 KAISA 만) — 전 환경 로그인·본인 스코프·전용 교육이력."""

from sqlalchemy import func, select

from app.core.config import settings
from app.domain.identity.schema import PassTestLoginRequest
from app.domain.identity.service import identity_service
from app.domain.trainee.model import Trainee
from app.domain.training_record.model import TrainingRecord
from tests.integration.helpers import (
    make_grade,
    make_record,
    make_trainee,
    member_cookie,
)


def _body(name: str = "KAISA") -> PassTestLoginRequest:
    return PassTestLoginRequest(name=name)


async def _kaisa_trainee(db, user_id) -> Trainee:
    return (
        await db.execute(select(Trainee).where(Trainee.user_id == user_id))
    ).scalar_one()


class TestKaisaLogin:
    async def test_find_or_create_not_super(self, client, db):
        first, _ = await identity_service.kaisa_login(db, _body())
        second, _ = await identity_service.kaisa_login(db, _body())
        assert first.id == second.id
        assert first.name == "KAISA"
        assert first.is_super is False
        assert first.review_status == "approved"

    async def test_allowed_in_production(self, client, db, monkeypatch):
        monkeypatch.setattr(settings, "ENVIRONMENT", "production")
        resp = await client.post("/api/auth/pass/kaisa-login", json={"name": "KAISA"})
        assert resp.status_code == 200
        assert resp.json()["is_super"] is False

    async def test_session_not_super(self, client, db):
        _, token = await identity_service.kaisa_login(db, _body())
        resp = await client.get("/api/me/session", cookies=member_cookie(token))
        assert resp.status_code == 200
        assert resp.json()["is_super"] is False

    async def test_other_name_rejected(self, client, db):
        resp = await client.post("/api/auth/pass/kaisa-login", json={"name": "홍길동"})
        assert resp.status_code == 404

    async def test_super_login_still_hidden_in_production(self, client, db, monkeypatch):
        monkeypatch.setattr(settings, "ENVIRONMENT", "production")
        resp = await client.post("/api/auth/pass/super-login", json={"name": "KAISA"})
        assert resp.status_code == 404


class TestKaisaRecord:
    async def test_creates_own_record_without_touching_others(self, client, db):
        grade = await make_grade(db, code="g-kaisa", name="카이사")
        _, member = await make_trainee(db, grade.id, ci_raw="ci-kaisa", trainee_no="TR-K-1")
        original = await make_record(db, member.id, record_no="TRN-K-1")
        await db.commit()

        result, _ = await identity_service.kaisa_login(db, _body())
        trainee = await _kaisa_trainee(db, result.id)
        records = (
            await db.execute(
                select(TrainingRecord).where(TrainingRecord.trainee_id == trainee.id)
            )
        ).scalars().all()
        assert len(records) == 1
        record = records[0]
        assert record.training_record_no == "KAISA-TR-0001"
        assert record.course_name == "감리원 법정 계속교육 (정기)"
        assert record.completion_status == "completed"
        assert record.is_demo is False

        await db.refresh(original)
        assert original.trainee_id == member.id  # 실제 회원 이력은 그대로

        # 재로그인해도 더 만들지 않는다
        await identity_service.kaisa_login(db, _body())
        count = (
            await db.execute(
                select(func.count())
                .select_from(TrainingRecord)
                .where(TrainingRecord.trainee_id == trainee.id)
            )
        ).scalar_one()
        assert count == 1

    async def test_created_even_without_any_records(self, client, db):
        result, _ = await identity_service.kaisa_login(db, _body())
        trainee = await _kaisa_trainee(db, result.id)
        count = (
            await db.execute(
                select(func.count())
                .select_from(TrainingRecord)
                .where(TrainingRecord.trainee_id == trainee.id)
            )
        ).scalar_one()
        assert count == 1

    async def test_sees_only_own_records(self, client, db):
        grade = await make_grade(db, code="g-kaisa2", name="카이사2")
        _, member = await make_trainee(db, grade.id, ci_raw="ci-kaisa2", trainee_no="TR-K-2")
        original = await make_record(db, member.id, record_no="TRN-K-2")
        await db.commit()

        _, token = await identity_service.kaisa_login(db, _body())
        resp = await client.get(
            "/api/me/training-records",
            params={"page": 1, "limit": 20},
            cookies=member_cookie(token),
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert str(original.id) not in [item["id"] for item in items]
        assert len(items) == 1
        assert items[0]["course_name"] == "감리원 법정 계속교육 (정기)"


class TestKaisaIssuance:
    async def test_can_issue_copied_record(self, client, db):
        """0원 등급이면 결제 없이 바로 발급 — KAISA 계정이 실제 발급 플로우를 탄다."""
        grade = await make_grade(db, code="g-kaisa3", name="카이사3")
        grade.price_krw = 0
        await db.commit()

        result, token = await identity_service.kaisa_login(db, _body())
        trainee = await _kaisa_trainee(db, result.id)
        copy = (
            await db.execute(
                select(TrainingRecord).where(TrainingRecord.trainee_id == trainee.id)
            )
        ).scalar_one()

        resp = await client.post(
            "/api/certificate-requests",
            json={"training_record_id": str(copy.id)},
            cookies=member_cookie(token),
        )
        assert resp.status_code in (200, 201), resp.text
        assert resp.json()["status"] == "issued"
