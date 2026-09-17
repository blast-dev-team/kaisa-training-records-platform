"""통합 — PASS 본인인증 매칭: 자동(CI) / 수동 심사 / 거부 / 리플레이."""

import pytest
from sqlalchemy import select

from app.domain.identity.model import IdentityReview
from app.integrations import portone
from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_trainee,
)


def _fake_portone(monkeypatch, verification_id: str, payload: dict):
    async def fake_get(vid: str):
        return {"id": vid, **payload}

    monkeypatch.setattr(portone, "get_identity_verification", fake_get)


async def _pass_flow(client, monkeypatch, verification_id: str, payload: dict):
    _fake_portone(monkeypatch, verification_id, payload)
    start = await client.post(
        "/api/auth/pass", json={"identity_verification_id": verification_id}
    )
    assert start.status_code == 200
    state = start.json()["state"]
    complete = await client.post("/api/auth/pass/complete", json={"state": state})
    return complete


_VERIFIED_KIM = {
    "status": "VERIFIED",
    "verifiedCustomer": {
        "ci": "ci-kim",
        "di": "di-kim",
        "name": "김정회",
        "phoneNumber": "01011112222",
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

    async def test_birth_saved_from_verification(self, client, db, monkeypatch):
        """본인인증 결과의 생년월일을 고객(users.birth)에 저장한다."""
        from app.core.crypto import sha256_hex
        from app.domain.user.model import User

        payload = {
            "status": "VERIFIED",
            "verifiedCustomer": {
                "ci": "ci-birth",
                "name": "생년자",
                "phoneNumber": "01000001111",
                "birthDate": "1990-01-01",
            },
        }
        resp = await _pass_flow(client, monkeypatch, "vid-birth", payload)
        assert resp.status_code == 200
        user = (
            await db.execute(select(User).where(User.ci_hash == sha256_hex("ci-birth")))
        ).scalar_one()
        assert user.birth == "19900101"

    async def test_unknown_ci_goes_manual_review(self, client, db, monkeypatch):
        """production — 교육생 미연결이면 수동 심사로 간다."""
        from app.core.config import settings

        monkeypatch.setattr(settings, "ENVIRONMENT", "production")
        payload = {
            "status": "VERIFIED",
            "verifiedCustomer": {
                "ci": "ci-newperson",
                "name": "새사람",
                "phoneNumber": "01099998888",
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

    async def test_unknown_ci_creates_demo_trainee(self, client, db, monkeypatch):
        """local·staging — 교육생 미연결이면 데모 교육생을 자동 생성한다.

        등급까지 확정돼 발급·결제 게이트(GRADE_NOT_DETERMINED)를 통과한다.
        """
        from app.domain.trainee.model import Trainee

        payload = {
            "status": "VERIFIED",
            "verifiedCustomer": {
                "ci": "ci-demo-person",
                "name": "데모사람",
                "phoneNumber": "01077776666",
            },
        }
        resp = await _pass_flow(client, monkeypatch, "vid-demo-1", payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body["review_status"] == "approved"

        trainee = (
            await db.execute(
                select(Trainee).where(Trainee.user_id == body["id"])
            )
        ).scalar_one()
        assert trainee.name == "데모사람"
        assert trainee.trainee_no is not None
        assert trainee.membership_grade_id is not None
        assert trainee.review_status == "approved"

        # 등급 판별 완료 — 발급 게이트(GRADE_NOT_DETERMINED) 통과 상태
        profile = await client.get("/api/me/profile")
        assert profile.status_code == 200
        assert profile.json()["review_status"] == "approved"
        assert profile.json()["grade_name"] is not None

    async def test_demo_login_grade_price_issuable(self, client, db, monkeypatch):
        """데모 로그인 등급(일반 3,000원)으로 발급 신청이 바로 통과한다.

        가격은 등급이 가진다 — FE 표기(3,000원)와 동일.
        """
        from tests.integration.helpers import make_record

        payload = {
            "status": "VERIFIED",
            "verifiedCustomer": {
                "ci": "ci-demo-pricing",
                "name": "가격사람",
                "phoneNumber": "01066665555",
            },
        }
        resp = await _pass_flow(client, monkeypatch, "vid-demo-price-1", payload)
        assert resp.status_code == 200
        user_id = resp.json()["id"]

        from app.domain.trainee.model import Trainee

        trainee = (
            await db.execute(select(Trainee).where(Trainee.user_id == user_id))
        ).scalar_one()
        record = await make_record(
            db, trainee.id, record_no="TRN-DEMO-PRICE-1"
        )
        await db.commit()

        batch = await client.post(
            "/api/certificate-requests/batch",
            json={
                "items": [
                    {
                        "training_record_id": str(record.id),
                        "issue_type": "original",
                    }
                ]
            },
        )
        assert batch.status_code == 201, batch.json()
        body = batch.json()[0]
        assert body["amount_krw"] == 3000
        assert body["order_no"] is not None
        assert body["status"] == "payment_pending"


class TestManualReview:
    """어드민 수동 심사 — production 기준 (데모 자동생성이 없다는 전제)."""

    @pytest.fixture(autouse=True)
    def _production_env(self, monkeypatch):
        from app.core.config import settings

        monkeypatch.setattr(settings, "ENVIRONMENT", "production")

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
            "verifiedCustomer": {
                "ci": "ci-mipan",
                "name": "이미판",
                "phoneNumber": "01055556666",
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
            cookies=admin_cookie(admin_token),
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
            "verifiedCustomer": {
                "ci": "ci-reject",
                "name": "거부자",
                "phoneNumber": "01077778888",
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
            cookies=admin_cookie(admin_token),
        )
        assert reject.status_code == 200
        assert reject.json()["status"] == "rejected"


class TestPassFailures:
    async def test_replayed_state_rejected(self, client, db, monkeypatch):
        _fake_portone(monkeypatch, "vid-replay", _VERIFIED_KIM)
        start = await client.post(
            "/api/auth/pass", json={"identity_verification_id": "vid-replay"}
        )
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
            {"status": "VERIFIED", "verifiedCustomer": {"name": "무씨"}},
        )
        assert resp.status_code == 502
        assert resp.json()["code"] == "IDENTITY_NO_CI"


class TestTestModePhoneFallback:
    async def test_no_ci_login_by_phone_in_test_env(self, client, db, monkeypatch):
        """테스트 채널 수기 인증(CI 미제공) — 전화번호로 식별 (ENVIRONMENT != production)."""
        from app.core.crypto import sha256_hex
        from app.domain.user.model import User

        payload = {
            "status": "VERIFIED",
            "verifiedCustomer": {
                "name": "폰사람",
                "phoneNumber": "01012341234",
            },
        }
        resp = await _pass_flow(client, monkeypatch, "vid-phone-fb", payload)
        assert resp.status_code == 200
        user = (
            await db.execute(
                select(User).where(User.ci_hash == sha256_hex("test:01012341234"))
            )
        ).scalar_one()
        assert user.name == "폰사람"

    async def test_production_still_requires_ci(self, client, db, monkeypatch):
        from app.core.config import settings

        monkeypatch.setattr(settings, "ENVIRONMENT", "production")
        payload = {
            "status": "VERIFIED",
            "verifiedCustomer": {
                "name": "폰사람",
                "phoneNumber": "01012341234",
            },
        }
        resp = await _pass_flow(client, monkeypatch, "vid-prod-noci", payload)
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
