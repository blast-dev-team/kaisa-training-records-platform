"""통합 — 관리자 비밀번호: 본인 변경(PATCH /auth/password) + super 리셋(PATCH /admin-users)."""

from sqlalchemy import select

from app.domain.audit.model import AuditLog
from tests.integration.helpers import admin_cookie, make_admin

NEW_PASSWORD = "new-passw0rd"


async def _audit_rows(db) -> list[AuditLog]:
    return list((await db.execute(select(AuditLog))).scalars().all())


class TestChangeOwnPassword:
    async def test_change_success_and_relogin(self, client, db):
        admin, token = await make_admin(db)
        await db.commit()

        resp = await client.patch(
            "/api/auth/password",
            json={"current_password": "admin-passw0rd", "new_password": NEW_PASSWORD},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

        # 새 비밀번호로 재로그인 성공
        relogin = await client.post(
            "/api/auth/login",
            json={"email": admin.email, "password": NEW_PASSWORD},
        )
        assert relogin.status_code == 200

    async def test_wrong_current_password_401(self, client, db):
        _admin, token = await make_admin(db)
        await db.commit()

        resp = await client.patch(
            "/api/auth/password",
            json={"current_password": "wrong-passw0rd", "new_password": NEW_PASSWORD},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 401
        assert resp.json()["code"] == "INVALID_CREDENTIALS"

    async def test_weak_new_password_400(self, client, db):
        _admin, token = await make_admin(db)
        await db.commit()

        resp = await client.patch(
            "/api/auth/password",
            json={"current_password": "admin-passw0rd", "new_password": "short"},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "WEAK_PASSWORD"

    async def test_change_recorded_in_audit_without_secret(self, client, db):
        admin, token = await make_admin(db)
        await db.commit()

        resp = await client.patch(
            "/api/auth/password",
            json={"current_password": "admin-passw0rd", "new_password": NEW_PASSWORD},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 200

        rows = [
            r
            for r in await _audit_rows(db)
            if r.action == "admin_user.password_changed"
        ]
        assert len(rows) == 1
        row = rows[0]
        assert row.entity_type == "admin_user"
        assert row.entity_id == admin.id
        assert row.actor_admin_id == admin.id
        # 평문·해시 어느 쪽도 before/after에 남지 않는다
        assert NEW_PASSWORD not in str(row.before_data) + str(row.after_data)

    async def test_unauthenticated_401(self, client, db):
        resp = await client.patch(
            "/api/auth/password",
            json={"current_password": "admin-passw0rd", "new_password": NEW_PASSWORD},
        )
        assert resp.status_code == 401


class TestSuperResetPassword:
    async def test_reset_success_and_relogin(self, client, db):
        actor, actor_token = await make_admin(db)
        target, _ = await make_admin(db, email="staff@example.com", role="staff")
        await db.commit()

        resp = await client.patch(
            f"/api/admin-users/{target.id}",
            json={"password": NEW_PASSWORD},
            cookies=admin_cookie(actor_token),
        )
        assert resp.status_code == 200

        # 새 비밀번호로 로그인 성공
        relogin = await client.post(
            "/api/auth/login",
            json={"email": target.email, "password": NEW_PASSWORD},
        )
        assert relogin.status_code == 200

    async def test_reset_weak_password_400(self, client, db):
        _actor, actor_token = await make_admin(db)
        target, _ = await make_admin(db, email="staff@example.com", role="staff")
        await db.commit()

        resp = await client.patch(
            f"/api/admin-users/{target.id}",
            json={"password": "short"},
            cookies=admin_cookie(actor_token),
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "WEAK_PASSWORD"

    async def test_staff_forbidden_403(self, client, db):
        staff, staff_token = await make_admin(db, email="staff@example.com", role="staff")
        await db.commit()

        resp = await client.patch(
            f"/api/admin-users/{staff.id}",
            json={"password": NEW_PASSWORD},
            cookies=admin_cookie(staff_token),
        )
        assert resp.status_code == 403

    async def test_reset_recorded_in_audit_without_secret(self, client, db):
        actor, actor_token = await make_admin(db)
        target, _ = await make_admin(db, email="staff@example.com", role="staff")
        await db.commit()

        resp = await client.patch(
            f"/api/admin-users/{target.id}",
            json={"password": NEW_PASSWORD},
            cookies=admin_cookie(actor_token),
        )
        assert resp.status_code == 200

        rows = [
            r
            for r in await _audit_rows(db)
            if r.action == "admin_user.password_reset"
        ]
        assert len(rows) == 1
        row = rows[0]
        assert row.entity_id == target.id
        assert row.actor_admin_id == actor.id
        assert NEW_PASSWORD not in str(row.before_data) + str(row.after_data)
