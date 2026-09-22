"""통합 — 교육생 미연결 세션: 200 + 심사 대기 플래그 (WEB 심사 대기 화면 분기용)."""

from sqlalchemy import select

from app.domain.identity.model import IdentityReview, IdentityVerification
from app.domain.user.model import User
from app.core.session import create_user_session
from app.core.crypto import sha256_hex
from tests.integration.helpers import member_cookie


async def _user(db, ci: str, name: str) -> User:
    user = User(ci_hash=sha256_hex(ci), name=name)
    db.add(user)
    await db.flush()
    return user


class TestUnlinkedSession:
    async def test_unlinked_without_review(self, client, db):
        user = await _user(db, "ci-unlinked-1", "미연결고객")
        token = await create_user_session(db, user.id, "test")
        await db.commit()

        resp = await client.get(
            "/api/me/session", cookies=member_cookie(token)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["trainee_linked"] is False
        assert body["review_pending"] is False

    async def test_unlinked_with_pending_review(self, client, db):
        user = await _user(db, "ci-unlinked-2", "심사대기고객")
        verification = IdentityVerification(
            user_id=user.id,
            provider_verification_id="iv-review-test",
            status="verified",
            verified_name="심사대기고객",
            verified_at=None,
        )
        db.add(verification)
        await db.flush()
        db.add(
            IdentityReview(
                user_id=user.id,
                status="manual_review",
                identity_verification_id=verification.id,
            )
        )
        token = await create_user_session(db, user.id, "test")
        await db.commit()

        resp = await client.get(
            "/api/me/session", cookies=member_cookie(token)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["trainee_linked"] is False
        assert body["review_pending"] is True

    async def test_linked_session_flags(self, client, db):
        """연결된 교육생 — 기존 계약 유지(trainee_linked=True 기본값)."""
        from app.domain.trainee.model import Trainee

        user = await _user(db, "ci-linked-1", "연결고객")
        trainee = Trainee(trainee_no="TR-2026-0051", name="연결고객", user_id=user.id)
        db.add(trainee)
        token = await create_user_session(db, user.id, "test")
        await db.commit()

        resp = await client.get(
            "/api/me/session", cookies=member_cookie(token)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["trainee_linked"] is True
        assert body["name"] == "연결고객"
