"""통합 — 슈퍼 계정(성명 KAISA + 지정 번호) — 로그인·전체 조회·수료증 미리보기."""

import uuid

from sqlalchemy import func, select

from app.core.config import settings
from app.domain.certificate.model import CompletionCertificate
from app.domain.identity.service import identity_service
from app.domain.user.model import User
from tests.integration.helpers import (
    make_grade,
    make_record,
    make_trainee,
    member_cookie,
    member_token,
)


def _body():
    from app.domain.identity.schema import PassTestLoginRequest

    return PassTestLoginRequest(name="KAISA")


async def _preview(client, token, record_id):
    return await client.get(
        "/api/me/completion-certificates/preview",
        params={"training_record_id": str(record_id)},
        cookies=member_cookie(token),
    )


async def _member_token_for(db, trainee) -> str:
    user = await db.get(User, trainee.user_id)
    return await member_token(db, user)


class TestSuperLogin:
    async def test_login_find_or_create(self, client, db):
        first, _ = await identity_service.super_login(db, _body())
        second, _ = await identity_service.super_login(db, _body())
        assert first.is_super is True
        assert first.name == "KAISA"
        assert first.id == second.id

    async def test_production_hidden(self, client, db, monkeypatch):
        monkeypatch.setattr(settings, "ENVIRONMENT", "production")
        resp = await client.post("/api/auth/pass/super-login", json={"name": "KAISA"})
        assert resp.status_code == 404

    async def test_session_flags_super(self, client, db):
        _, token = await identity_service.super_login(db, _body())
        await db.commit()
        resp = await client.get("/api/me/session", cookies=member_cookie(token))
        assert resp.status_code == 200
        assert resp.json()["is_super"] is True


class TestSuperView:
    async def test_sees_other_members_records(self, client, db):
        grade = await make_grade(db, code="g-sup", name="슈퍼테스트")
        _, member = await make_trainee(db, grade.id, ci_raw="ci-sup", trainee_no="TR-SUP-1")
        record = await make_record(db, member.id, record_no="TRN-SUP-1")
        await db.commit()

        _, token = await identity_service.super_login(db, _body())
        await db.commit()

        resp = await client.get(
            "/api/me/training-records",
            params={"page": 1, "limit": 20},
            cookies=member_cookie(token),
        )
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()["items"]]
        assert str(record.id) in ids

    async def test_normal_member_does_not_see_others(self, client, db):
        """대조 — 일반 회원은 본인 이력만. 슈퍼 계정과 다르게 남의 이력이 안 보인다."""
        grade = await make_grade(db, code="g-supn", name="슈퍼대조군")
        _, member = await make_trainee(db, grade.id, ci_raw="ci-supn", trainee_no="TR-SUP-N")
        own_record = await make_record(db, member.id, record_no="TRN-SUP-N")

        other_grade = await make_grade(db, code="g-supn2", name="슈퍼대조군2")
        _, stranger = await make_trainee(
            db, other_grade.id, ci_raw="ci-supn2", trainee_no="TR-SUP-N2"
        )
        stranger_record = await make_record(db, stranger.id, record_no="TRN-SUP-N2")
        await db.commit()

        token = await _member_token_for(db, member)
        resp = await client.get(
            "/api/me/training-records",
            params={"page": 1, "limit": 20},
            cookies=member_cookie(token),
        )
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()["items"]]
        assert str(own_record.id) in ids
        assert str(stranger_record.id) not in ids

    async def test_sees_record_detail_of_others(self, client, db):
        grade = await make_grade(db, code="g-sup2", name="슈퍼테스트2")
        _, member = await make_trainee(db, grade.id, ci_raw="ci-sup2", trainee_no="TR-SUP-2")
        record = await make_record(db, member.id, record_no="TRN-SUP-2")
        await db.commit()

        _, token = await identity_service.super_login(db, _body())
        await db.commit()

        resp = await client.get(
            f"/api/me/training-records/{record.id}",
            cookies=member_cookie(token),
        )
        assert resp.status_code == 200
        assert resp.json()["trainee_name"] == "홍길동"


class TestSuperPreview:
    async def test_preview_without_insert(self, client, db):
        grade = await make_grade(db, code="g-sup3", name="슈퍼테스트3")
        _, member = await make_trainee(db, grade.id, ci_raw="ci-sup3", trainee_no="TR-SUP-3")
        record = await make_record(db, member.id, record_no="TRN-SUP-3")
        await db.commit()

        _, token = await identity_service.super_login(db, _body())
        await db.commit()

        resp = await _preview(client, token, record.id)
        assert resp.status_code == 200
        body = resp.json()
        assert body["trainee_name"] == "홍길동"
        assert body["certificate_no"] == ""
        assert body["status"] == "preview"

        count = (
            await db.execute(select(func.count()).select_from(CompletionCertificate))
        ).scalar_one()
        assert count == 0

    async def test_preview_forbidden_for_normal_member(self, client, db):
        grade = await make_grade(db, code="g-sup4", name="슈퍼대조군4")
        _, member = await make_trainee(db, grade.id, ci_raw="ci-sup4", trainee_no="TR-SUP-4")
        await db.commit()
        token = await _member_token_for(db, member)

        resp = await _preview(client, token, uuid.uuid4())
        assert resp.status_code == 403

    async def test_preview_401_without_auth(self, client, db):
        resp = await client.get(
            "/api/me/completion-certificates/preview",
            params={"training_record_id": str(uuid.uuid4())},
        )
        assert resp.status_code == 401
