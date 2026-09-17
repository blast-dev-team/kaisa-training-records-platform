"""통합 — 본인인증 세션 연장 (POST /api/me/session/extend)."""

from datetime import datetime, timedelta

from app.core.kst import now_kst
from tests.integration.helpers import (
    make_grade,
    make_trainee,
    member_cookie,
    member_token,
)


async def _member(db, *, ci_raw="ci-ext"):
    grade = await make_grade(db, code=f"g-{ci_raw}", name=f"등급-{ci_raw}")
    user, trainee = await make_trainee(db, grade.id, ci_raw=ci_raw)
    token = await member_token(db, user)
    await db.commit()
    return user, trainee, token


class TestSessionExtend:
    async def test_extend_resets_expiry(self, client, db):
        _, _, token = await _member(db)
        before = now_kst()
        resp = await client.post("/api/me/session/extend", cookies=member_cookie(token))
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "홍길동"
        new_expiry = datetime.fromisoformat(body["expires_at"])
        assert new_expiry > before + timedelta(minutes=9)

    async def test_extend_garbage_token_401(self, client, db):
        resp = await client.post(
            "/api/me/session/extend", cookies=member_cookie("nonexistent")
        )
        assert resp.status_code == 401
        assert resp.json()["code"] == "SESSION_EXPIRED"
