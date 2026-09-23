"""통합 — 교육생 미연결 세션: 200 + 심사 대기 플래그 (WEB 심사 대기 화면 분기용)."""


from app.core.crypto import name_columns, sha256_hex
from app.core.session import create_user_session
from app.domain.identity.model import IdentityReview, IdentityVerification
from app.domain.user.model import User
from tests.integration.helpers import member_cookie


async def _user(db, ci: str, name: str) -> User:
    n_enc, n_hash = name_columns(name)
    user = User(ci_hash=sha256_hex(ci), name_encrypted=n_enc, name_hash=n_hash)
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
        v_enc, v_hash = name_columns("심사대기고객")
        verification = IdentityVerification(
            user_id=user.id,
            provider_verification_id="iv-review-test",
            status="verified",
            verified_name_encrypted=v_enc,
            verified_name_hash=v_hash,
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
        n_enc, n_hash = name_columns("연결고객")
        trainee = Trainee(
            trainee_no="TR-2026-0051",
            name_encrypted=n_enc,
            name_hash=n_hash,
            user_id=user.id,
        )
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
