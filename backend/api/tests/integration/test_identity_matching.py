"""통합 — PASS 본인인증 매칭: 자동(CI) / 수동 심사 / 거부 / 리플레이."""

from sqlalchemy import select

from app.domain.identity.model import IdentityReview
from app.integrations import portone
from tests.integration.helpers import (
    make_admin,
    make_grade,
    make_trainee,
    member_cookie,
)


def _fake_portone(monkeypatch, verification_id: str, payload: dict):
    async def fake_create():
        return {"id": verification_id, "redirect_url": "https://pg.test/redirect"}

    async def fake_get(vid: str):
        return {"id": vid, **payload}

    monkeypatch.setattr(portone, "create_identity_verification", fake_create)
    monkeypatch.setattr(portone, "get_identity_verification", fake_get)


async def _pass_flow(client, monkeypatch, verification_id: str, payload: dict):
    _fake_portone(monkeypatch, verification_id, payload)
    start = await client.post("/api/auth/pass")
    assert start.status_code == 200
    state = start.json()["state"]
    complete = await client.post("/api/auth/pass/complete", json={"state": state})
    return complete


_VERIFIED_KIM = {
    "status": "VERIFIED",
    "verified_customer": {
        "ci": "ci-kim",
        "di": "di-kim",
        "name": "김정회",
        "phone": "01011112222",
    },
}


class TestAutoMatch:
    async def test_known_ci_auto_matched(self, client, db, monkeypatch):
        grade = await make_grade(db)
        await make_trainee(
            db, grade.id, ci_raw="ci-kim", name="김정회", trainee_no="TR-2026-0001"
        )
        await db.commit()

        resp = await _pass_flow(client, monkeypatch, "vid-auto-1", _VERIFIED_KIM)
        assert resp.status_code == 200
        body = resp.json()
        assert body["matched"] is True
        assert body["review_status"] == "approved"
        # 세션 발급 — cookie 로 me 포털 접근 가능
        me = await client.get("/api/me/profile")
        assert me.status_code == 200
        assert me.json()["name"] == "김정회"

    async def test_unknown_ci_goes_manual_review(self, client, db, monkeypatch):
        payload = {
            "status": "VERIFIED",
            "verified_customer": {
                "ci": "ci-newperson",
                "name": "새사람",
                "phone": "01099998888",
            },
        }
        resp = await _pass_flow(client, monkeypatch, "vid-new-1", payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body["matched"] is False
        assert body["review_status"] == "manual_review"

        review = (
            await db.execute(
                select(IdentityReview).where(IdentityReview.status == "manual_review")
            )
        ).scalar_one()
        assert review.matched_by is None


class TestManualReview:
    async def test_admin_approve_links_trainee(self, client, db, monkeypatch):
        grade = await make_grade(db, code="g-approve", name="심사등급")
        # CI 없는 이관 교육생 — 수동 매칭 대상
        _, trainee = await make_trainee(
            db,
            grade.id,
            ci_raw=None,
            name="이미판",
            trainee_no="TR-2023-0009",
            review_status="unverified",
        )
        _, admin_token = await make_admin(db)
        await db.commit()

        payload = {
            "status": "VERIFIED",
            "verified_customer": {
                "ci": "ci-mipan",
                "name": "이미판",
                "phone": "01055556666",
            },
        }
        resp = await _pass_flow(client, monkeypatch, "vid-mipan-1", payload)
        assert resp.json()["review_status"] == "manual_review"

        review_id = (
            (
                await db.execute(
                    select(IdentityReview).where(
                        IdentityReview.status == "manual_review"
                    )
                )
            )
            .scalar_one()
            .id
        )

        approve = await client.post(
            f"/api/identity-reviews/{review_id}/approve",
            json={"trainee_id": str(trainee.id), "determined_grade_id": str(grade.id)},
            cookies=member_cookie(admin_token),
        )
        assert approve.status_code == 200
        assert approve.json()["status"] == "approved"

        # 연결 확인 — 같은 CI 로 다시 로그인하면 자동 매칭
        again = await _pass_flow(client, monkeypatch, "vid-mipan-2", payload)
        assert again.json()["matched"] is True

    async def test_admin_reject(self, client, db, monkeypatch):
        _, admin_token = await make_admin(db)
        await db.commit()  # API 가 자체 세션으로 admin 조회 — 커밋 필요
        payload = {
            "status": "VERIFIED",
            "verified_customer": {
                "ci": "ci-reject",
                "name": "거부자",
                "phone": "01077778888",
            },
        }
        await _pass_flow(client, monkeypatch, "vid-reject-1", payload)

        review_id = (
            (
                await db.execute(
                    select(IdentityReview).where(
                        IdentityReview.status == "manual_review"
                    )
                )
            )
            .scalar_one()
            .id
        )
        reject = await client.post(
            f"/api/identity-reviews/{review_id}/reject",
            json={"review_note": "서류 불일치"},
            cookies=member_cookie(admin_token),
        )
        assert reject.status_code == 200
        assert reject.json()["status"] == "rejected"


class TestPassFailures:
    async def test_replayed_state_rejected(self, client, db, monkeypatch):
        _fake_portone(monkeypatch, "vid-replay", _VERIFIED_KIM)
        start = await client.post("/api/auth/pass")
        state = start.json()["state"]
        first = await client.post("/api/auth/pass/complete", json={"state": state})
        assert first.status_code == 200
        replay = await client.post("/api/auth/pass/complete", json={"state": state})
        assert replay.status_code == 400
        assert replay.json()["code"] == "IDENTITY_ALREADY_USED"

    async def test_not_verified_rejected(self, client, db, monkeypatch):
        resp = await _pass_flow(client, monkeypatch, "vid-fail", {"status": "PENDING"})
        assert resp.status_code == 400
        assert resp.json()["code"] == "IDENTITY_NOT_VERIFIED"

    async def test_missing_ci_rejected(self, client, db, monkeypatch):
        resp = await _pass_flow(
            client,
            monkeypatch,
            "vid-noci",
            {"status": "VERIFIED", "verified_customer": {"name": "무씨"}},
        )
        assert resp.status_code == 502
        assert resp.json()["code"] == "IDENTITY_NO_CI"

    async def test_forged_state_rejected(self, client, db):
        resp = await client.post(
            "/api/auth/pass/complete", json={"state": "forged.state"}
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "IDENTITY_STATE_MISMATCH"


class TestCiSafety:
    async def test_ci_raw_never_stored(self, client, db, monkeypatch):
        """CI/DI 원문 절대 저장 금지 — 해시만 보관 (보안 원칙)."""
        from sqlalchemy import text

        await _pass_flow(client, monkeypatch, "vid-ci-safe", _VERIFIED_KIM)
        for table in ("identity_verifications", "users"):
            rows = await db.execute(text(f"SELECT * FROM {table}"))
            for row in rows:
                assert "ci-kim" not in str(tuple(row)), f"CI 원문이 {table} 에 저장됨"
