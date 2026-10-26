"""통합 — 관리자 인증 라이프사이클: 가입(화이트리스트)·로그인·세션·429."""

from datetime import timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.kst import now_kst
from app.core.session import hash_token
from app.domain.auth.model import AdminAllowedEmail, AdminSession
from tests.integration.helpers import admin_cookie, member_cookie


async def _allow_email(db, email="new@example.com", *, expired=False):
    """super 의 초대를 흉내 — 화이트리스트 행 + 초대 코드. 평문 코드를 돌려준다."""
    from app.domain.auth.service import auth_service
    from tests.integration.helpers import make_admin

    admin, _ = await make_admin(db, email="inviter@example.com")
    row = AdminAllowedEmail(email=email, status="pending", created_by=admin.id)
    code = auth_service._issue_invite(row)
    if expired:
        row.invite_expires_at = now_kst() - timedelta(minutes=1)
    db.add(row)
    await db.commit()
    return code


def _register(email="new@example.com", password="passw0rd123", code="", **extra):
    return {"email": email, "password": password, "invite_code": code, **extra}


class TestRegister:
    async def test_invited_email_registers_with_code(self, client, db):
        code = await _allow_email(db)
        resp = await client.post(
            "/api/auth/register", json=_register(code=code, name="새관리자")
        )
        assert resp.status_code == 201
        assert resp.json()["email"] == "new@example.com"
        # 화이트리스트 consumed + 코드 1회용
        allowed = (
            await db.execute(
                select(AdminAllowedEmail).where(
                    AdminAllowedEmail.email == "new@example.com"
                )
            )
        ).scalar_one()
        assert allowed.status == "joined"
        assert allowed.invite_code_hash is None

    async def test_code_is_case_and_hyphen_insensitive(self, client, db):
        code = await _allow_email(db)
        typed = code.replace("-", "").lower()
        resp = await client.post("/api/auth/register", json=_register(code=typed))
        assert resp.status_code == 201

    async def test_whitelisted_email_without_valid_code_403(self, client, db):
        """초대된 이메일을 추측해 먼저 가입하는 탈취를 막는다 — 코드가 없으면 거절."""
        await _allow_email(db)
        resp = await client.post(
            "/api/auth/register", json=_register(code="AAAA-BBBB-CCCC")
        )
        assert resp.status_code == 403
        assert resp.json()["code"] == "INVITE_INVALID"

    async def test_expired_code_403(self, client, db):
        code = await _allow_email(db, expired=True)
        resp = await client.post("/api/auth/register", json=_register(code=code))
        assert resp.status_code == 403
        assert resp.json()["code"] == "INVITE_INVALID"

    async def test_not_whitelisted_same_response(self, client, db):
        """초대 없음도 코드 불일치와 같은 응답 — 화이트리스트 존재 여부를 숨긴다."""
        resp = await client.post(
            "/api/auth/register",
            json=_register(email="stranger@example.com", code="AAAA-BBBB-CCCC"),
        )
        assert resp.status_code == 403
        assert resp.json()["code"] == "INVITE_INVALID"

    async def test_weak_password_400(self, client, db):
        code = await _allow_email(db)
        resp = await client.post(
            "/api/auth/register", json=_register(password="short1", code=code)
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "WEAK_PASSWORD"

    async def test_reused_code_rejected(self, client, db):
        code = await _allow_email(db)
        await client.post("/api/auth/register", json=_register(code=code))
        resp = await client.post("/api/auth/register", json=_register(code=code))
        assert resp.status_code == 403


class TestInviteManagement:
    async def test_super_invite_returns_code_once(self, client, db):
        from tests.integration.helpers import make_admin

        _, token = await make_admin(db, email="boss@example.com", role="super")
        await db.commit()
        resp = await client.post(
            "/api/admin-allowed-emails",
            json={"email": "invitee@example.com"},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 201, resp.text
        code = resp.json()["invite_code"]
        assert len(code) == 14 and resp.json()["invite_expires_at"]

        listed = await client.get(
            "/api/admin-allowed-emails", cookies=admin_cookie(token)
        )
        assert "invite_code" not in listed.json()[0]

        reissued = await client.post(
            f"/api/admin-allowed-emails/{resp.json()['id']}/invite-code",
            cookies=admin_cookie(token),
        )
        assert reissued.status_code == 200
        new_code = reissued.json()["invite_code"]
        assert new_code != code
        # 이전 코드는 즉시 무효
        old = await client.post(
            "/api/auth/register",
            json=_register(email="invitee@example.com", code=code),
        )
        assert old.status_code == 403
        ok = await client.post(
            "/api/auth/register",
            json=_register(email="invitee@example.com", code=new_code),
        )
        assert ok.status_code == 201

    async def test_staff_cannot_invite(self, client, db):
        from tests.integration.helpers import make_admin

        _, token = await make_admin(db, email="staff@example.com", role="staff")
        await db.commit()
        resp = await client.post(
            "/api/admin-allowed-emails",
            json={"email": "invitee@example.com"},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 403


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
    async def test_email_test_no_longer_bypasses_password(self, client, db):
        """이메일 '테스트' 비밀번호 우회는 삭제됐다 — 일반 로그인 실패로 처리."""
        resp = await client.post(
            "/api/auth/login",
            json={"email": "테스트", "password": ""},
        )
        assert resp.status_code == 401
        assert resp.json()["code"] == "INVALID_CREDENTIALS"
        assert not resp.cookies.get(settings.ADMIN_SESSION_COOKIE_NAME)
