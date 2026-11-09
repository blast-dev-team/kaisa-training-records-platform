"""통합 — 테스트 로그인(local·staging): 감리원 성명 + 생년월일 + 휴대전화 01012345678 → 그 감리원으로 로그인.

운영(production)에서는 열리지 않는다. 성명 KAISA 는 기존 KAISA 계정 경로를 그대로 탄다.
"""

from datetime import date

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.domain.trainee.model import Trainee
from tests.integration.helpers import (
    make_grade,
    make_record,
    make_trainee,
    member_cookie,
)

PATH = "/api/auth/pass/kaisa-login"
PHONE = "01012345678"


async def _trainee(db, *, name="김감리", birth=date(1985, 3, 7), ci_raw="ci-tl", no="TR-TL-1", review="approved"):
    grade = await make_grade(db, code=f"g-{no}", name=f"등급{no}")
    user, trainee = await make_trainee(
        db, grade.id, ci_raw=ci_raw, name=name, trainee_no=no, review_status=review
    )
    trainee.birth_date = birth
    await db.commit()
    return user, trainee


async def _login(client, name="김감리", birth="19850307", phone=PHONE):
    return await client.post(PATH, json={"name": name, "birth": birth, "phone": phone})


class TestLogin:
    async def test_logs_in_as_linked_member(self, client, db):
        user, trainee = await _trainee(db)
        record = await make_record(db, trainee.id, record_no="TRN-TL-1")
        await db.commit()

        resp = await _login(client)
        assert resp.status_code == 200, resp.json()
        body = resp.json()
        assert body["id"] == str(user.id)
        assert body["name"] == "김감리"
        assert body["is_super"] is False

        # 세션으로 그 감리원 본인 이력이 보인다
        token = resp.cookies.get(settings.SESSION_COOKIE_NAME)
        items = (
            await client.get(
                "/api/me/training-records",
                params={"page": 1, "limit": 20},
                cookies=member_cookie(token),
            )
        ).json()["items"]
        assert [item["id"] for item in items] == [str(record.id)]

    async def test_unlinked_trainee_gets_account_once(self, client, db):
        """회원 계정이 없는 감리원(이관분)은 테스트 계정을 만들어 연결 — 재로그인은 같은 계정."""
        _, trainee = await _trainee(db, ci_raw=None, no="TR-TL-2")
        first = await _login(client)
        second = await _login(client)
        assert first.status_code == second.status_code == 200
        assert first.json()["id"] == second.json()["id"]
        await db.refresh(trainee)
        assert str(trainee.user_id) == first.json()["id"]

    async def test_pending_review_trainee_is_approved(self, client, db):
        _, trainee = await _trainee(db, no="TR-TL-3", review="manual_review")
        assert (await _login(client)).json()["review_status"] == "approved"
        await db.refresh(trainee)
        assert trainee.review_status == "approved"

    async def test_hyphenated_birth_and_phone(self, client, db):
        await _trainee(db, no="TR-TL-4")
        assert (await _login(client, birth="1985-03-07", phone="010-1234-5678")).status_code == 200

    async def test_allowed_on_staging(self, client, db, monkeypatch):
        monkeypatch.setattr(settings, "ENVIRONMENT", "staging")
        await _trainee(db, no="TR-TL-5")
        assert (await _login(client)).status_code == 200


class TestRejected:
    async def test_production_closed(self, client, db, monkeypatch):
        monkeypatch.setattr(settings, "ENVIRONMENT", "production")
        await _trainee(db, no="TR-TL-6")
        resp = await _login(client)
        assert resp.status_code == 404
        assert "set-cookie" not in resp.headers

    @pytest.mark.parametrize(
        "override",
        [
            {"phone": "01099999999"},
            {"birth": "19850308"},
            {"name": "김감리아"},
            {"birth": ""},
            {"birth": "19851399"},
        ],
    )
    async def test_mismatch_404(self, client, db, override):
        await _trainee(db, no="TR-TL-7")
        resp = await _login(client, **override)
        assert resp.status_code == 404, override

    async def test_deleted_trainee_404(self, client, db):
        _, trainee = await _trainee(db, no="TR-TL-8")
        trainee.deleted_at = trainee.created_at
        await db.commit()
        assert (await _login(client)).status_code == 404

    async def test_same_name_birth_twice_409(self, client, db):
        await _trainee(db, no="TR-TL-9", ci_raw="ci-a")
        await _trainee(db, no="TR-TL-10", ci_raw="ci-b")
        resp = await _login(client)
        assert resp.status_code == 409
        assert "여러 명" in resp.json()["message"]


class TestKaisaUnchanged:
    async def test_kaisa_name_still_uses_kaisa_account(self, client, db):
        resp = await _login(client, name="KAISA", birth="19900101")
        assert resp.status_code == 200
        assert resp.json()["name"] == "KAISA"
        kaisa = (
            await db.execute(select(Trainee).where(Trainee.user_id == resp.json()["id"]))
        ).scalar_one()
        assert kaisa is not None
