"""통합 — 관리자 인증 라이프사이클: 가입(화이트리스트)·로그인·세션·429."""

from datetime import timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.kst import now_kst
from app.core.session import hash_token
from app.domain.auth.model import AdminAllowedEmail, AdminSession
from tests.integration.helpers import admin_cookie, member_cookie


async def _allow_email(db, email="new@example.com"):
    from tests.integration.helpers import make_admin

    admin, _ = await make_admin(db, email="inviter@example.com")
    db.add(AdminAllowedEmail(email=email, status="pending", created_by=admin.id))
    await db.commit()


class TestRegister:
    async def test_whitelisted_email_registers(self, client, db):
        await _allow_email(db)
        resp = await client.post(
            "/api/auth/register",
            json={
                "email": "new@example.com",
                "password": "passw0rd123",
                "name": "새관리자",
            },
        )
        assert resp.status_code == 201
        assert resp.json()["email"] == "new@example.com"
        # 화이트리스트 consumed
        allowed = (
            await db.execute(
                select(AdminAllowedEmail).where(
                    AdminAllowedEmail.email == "new@example.com"
                )
            )
        ).scalar_one()
        assert allowed.status == "joined"

    async def test_not_whitelisted_403(self, client, db):
        resp = await client.post(
            "/api/auth/register",
            json={"email": "stranger@example.com", "password": "passw0rd123"},
        )
        assert resp.status_code == 403
        assert resp.json()["code"] == "EMAIL_NOT_ALLOWED"

    async def test_weak_password_400(self, client, db):
        await _allow_email(db)
        resp = await client.post(
            "/api/auth/register",
            json={"email": "new@example.com", "password": "short1"},
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "WEAK_PASSWORD"

    async def test_duplicate_email_409(self, client, db):
        await _allow_email(db)
        await client.post(
            "/api/auth/register",
            json={"email": "new@example.com", "password": "passw0rd123"},
        )
        # 이메일 중복은 화이트리스트 상태와 무관하게 409 (duplicate 검사가 먼저)
        resp = await client.post(
            "/api/auth/register",
            json={"email": "new@example.com", "password": "passw0rd123"},
        )
        assert resp.status_code == 409


class TestLoginSession:
    async def test_login_me_logout(self, client, db):
        from tests.integration.helpers import make_admin

        await make_admin(db)
        await db.commit()

        resp = await client.post(
            "/api/auth/login",
            json={"email": "admin@example.com", "password": "admin-passw0rd"},
        )
        assert resp.status_code == 200
        cookie = resp.cookies.get(settings.ADMIN_SESSION_COOKIE_NAME)
        assert cookie

        me = await client.get("/api/auth/me")  # httpx 가 set-cookie 를 jar 에 유지
        assert me.status_code == 200
        assert me.json()["email"] == "admin@example.com"

        out = await client.post("/api/auth/logout")
        assert out.status_code == 200
        # 쿠키 만료 처리 후 재요청 → 세션 무효
        assert (await client.get("/api/auth/me")).status_code == 401

    async def test_wrong_password_401_no_cookie(self, client, db):
        from tests.integration.helpers import make_admin

        await make_admin(db)
        await db.commit()
        resp = await client.post(
            "/api/auth/login",
            json={"email": "admin@example.com", "password": "wrong-pass1"},
        )
        assert resp.status_code == 401
        assert resp.json()["code"] == "INVALID_CREDENTIALS"

    async def test_garbage_token_401_session_expired(self, client):
        me = await client.get("/api/auth/me", cookies=member_cookie("garbage-token"))
        assert me.status_code == 401
        assert me.json()["code"] == "SESSION_EXPIRED"

    async def test_login_rate_limited_after_5_failures(self, client, db):
        from tests.integration.helpers import make_admin

        await make_admin(db, email="rate@example.com")
        await db.commit()
        for _ in range(5):
            resp = await client.post(
                "/api/auth/login",
                json={"email": "rate@example.com", "password": "wrong-pass1"},
            )
            assert resp.status_code == 401
        sixth = await client.post(
            "/api/auth/login",
            json={"email": "rate@example.com", "password": "admin-passw0rd"},
        )
        assert sixth.status_code == 429
        assert sixth.json()["code"] == "TOO_MANY_ATTEMPTS"

    async def test_successful_login_resets_attempts(self, client, db):
        from tests.integration.helpers import make_admin

        await make_admin(db, email="reset@example.com")
        await db.commit()
        for _ in range(4):
            await client.post(
                "/api/auth/login",
                json={"email": "reset@example.com", "password": "wrong-pass1"},
            )
        ok = await client.post(
            "/api/auth/login",
            json={"email": "reset@example.com", "password": "admin-passw0rd"},
        )
        assert ok.status_code == 200
        # 성공으로 카운트 클리어 — 다시 실패해도 즉시 429 아님
        fail = await client.post(
            "/api/auth/login",
            json={"email": "reset@example.com", "password": "wrong-pass1"},
        )
        assert fail.status_code == 401


class TestSessionSliding:
    """슬라이딩 갱신 — 잔여 TTL 절반 이하에서 /api/auth/me 한 번이면 expires_at 리셋."""

    async def _session_row(self, db, token: str) -> AdminSession:
        return (
            await db.execute(
                select(AdminSession).where(AdminSession.token_hash == hash_token(token))
            )
        ).scalar_one()

    async def test_fresh_session_not_extended(self, client, db):
        """잔여가 TTL 절반 초과면 expires_at 그대로 — 매 요청 UPDATE 하지 않는다."""
        from tests.integration.helpers import make_admin

        _, token = await make_admin(db)
        await db.commit()

        before = (await self._session_row(db, token)).expires_at
        me = await client.get("/api/auth/me", cookies=admin_cookie(token))
        assert me.status_code == 200

        after = (await self._session_row(db, token)).expires_at
        assert after == before

    async def test_near_expiry_session_extended(self, client, db):
        """잔여 5h(절반 이하) → /me 호출 시 now+TTL 로 리셋."""
        from tests.integration.helpers import make_admin

        _, token = await make_admin(db)
        row = await self._session_row(db, token)
        row.expires_at = now_kst() + timedelta(hours=5)
        await db.commit()

        me = await client.get("/api/auth/me", cookies=admin_cookie(token))
        assert me.status_code == 200

        # 앱 세션이 커밋한 UPDATE 를 이 세션 identity map 캐시가 가리지 않게 만료
        db.expire_all()
        after = (await self._session_row(db, token)).expires_at
        assert after - now_kst() > timedelta(hours=23)


class TestDemoLogin:
    async def test_email_test_logs_in_as_admin(self, client, db):
        """이메일 '테스트' → 데모 관리자 세션 발급. 쿠키로 /me 까지 관리자 확인."""
        resp = await client.post(
            "/api/auth/login",
            json={"email": "테스트", "password": ""},
        )
        assert resp.status_code == 200
        assert resp.cookies.get(settings.ADMIN_SESSION_COOKIE_NAME)

        me = await client.get("/api/auth/me")
        assert me.status_code == 200
        body = me.json()
        assert body["account_type"] == "admin"
        assert body["role"] == "super"

    async def test_demo_login_reuses_same_admin(self, client, db):
        """반복 로그인해도 테스트 관리자 row 는 하나 (find-or-create 멱등)."""
        from sqlalchemy import func, select

        from app.domain.auth.model import AdminUser

        await client.post("/api/auth/login", json={"email": "테스트", "password": ""})
        await client.post("/api/auth/login", json={"email": " 테스트 ", "password": ""})
        count = (
            await db.execute(
                select(func.count())
                .select_from(AdminUser)
                .where(AdminUser.email == "test-admin@kaisa.or.kr")
            )
        ).scalar_one()
        assert count == 1
