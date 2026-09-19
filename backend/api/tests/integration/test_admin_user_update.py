"""통합 — 관리자 계정 수정: 이름·역할 변경 + 자기 역할 변경 가드 + 감사 로그."""

from sqlalchemy import select

from app.domain.audit.model import AuditLog
from tests.integration.helpers import admin_cookie, make_admin


async def _audit_rows(db) -> list[AuditLog]:
    return list((await db.execute(select(AuditLog))).scalars().all())


class TestAdminUserUpdate:
    async def test_super_updates_name_and_role(self, client, db):
        _actor, actor_token = await make_admin(db)
        target, _ = await make_admin(db, email="staff@example.com", role="staff")
        await db.commit()

        resp = await client.patch(
            f"/api/admin-users/{target.id}",
            json={"name": "바뀐이름", "role": "super"},
            cookies=admin_cookie(actor_token),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "바뀐이름"
        assert body["role"] == "super"
        await db.refresh(target)
        assert target.name == "바뀐이름"
        assert target.role == "super"

    async def test_name_change_recorded_in_audit(self, client, db):
        actor, actor_token = await make_admin(db)
        target, _ = await make_admin(db, email="staff@example.com", role="staff")
        await db.commit()

        resp = await client.patch(
            f"/api/admin-users/{target.id}",
            json={"name": "바뀐이름"},
            cookies=admin_cookie(actor_token),
        )
        assert resp.status_code == 200

        rows = [r for r in await _audit_rows(db) if r.action == "admin_user.updated"]
        assert len(rows) == 1
        row = rows[0]
        assert row.entity_type == "admin_user"
        assert row.entity_id == target.id
        assert row.actor_admin_id == actor.id
        assert row.before_data == {"name": "테스트 관리자"}
        assert row.after_data == {"name": "바뀐이름"}

    async def test_role_change_recorded_in_audit(self, client, db):
        _actor, actor_token = await make_admin(db)
        target, _ = await make_admin(db, email="staff@example.com", role="staff")
        await db.commit()

        resp = await client.patch(
            f"/api/admin-users/{target.id}",
            json={"role": "super"},
            cookies=admin_cookie(actor_token),
        )
        assert resp.status_code == 200

        rows = [r for r in await _audit_rows(db) if r.action == "admin_user.updated"]
        assert rows[0].before_data == {"role": "staff"}
        assert rows[0].after_data == {"role": "super"}

    async def test_no_change_no_audit(self, client, db):
        _actor, actor_token = await make_admin(db)
        target, _ = await make_admin(db, email="staff@example.com", role="staff")
        await db.commit()

        resp = await client.patch(
            f"/api/admin-users/{target.id}",
            json={"name": "테스트 관리자", "role": "staff"},
            cookies=admin_cookie(actor_token),
        )
        assert resp.status_code == 200
        assert [r for r in await _audit_rows(db) if r.action == "admin_user.updated"] == []

    async def test_self_role_change_400(self, client, db):
        actor, actor_token = await make_admin(db)
        await db.commit()

        resp = await client.patch(
            f"/api/admin-users/{actor.id}",
            json={"role": "staff"},
            cookies=admin_cookie(actor_token),
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "VALIDATION_ERROR"

    async def test_invalid_role_400(self, client, db):
        _actor, actor_token = await make_admin(db)
        target, _ = await make_admin(db, email="staff@example.com", role="staff")
        await db.commit()

        resp = await client.patch(
            f"/api/admin-users/{target.id}",
            json={"role": "owner"},
            cookies=admin_cookie(actor_token),
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "VALIDATION_ERROR"

    async def test_blank_name_400(self, client, db):
        _actor, actor_token = await make_admin(db)
        target, _ = await make_admin(db, email="staff@example.com", role="staff")
        await db.commit()

        resp = await client.patch(
            f"/api/admin-users/{target.id}",
            json={"name": "   "},
            cookies=admin_cookie(actor_token),
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "VALIDATION_ERROR"

    async def test_staff_forbidden_403(self, client, db):
        staff, staff_token = await make_admin(db, email="staff@example.com", role="staff")
        await db.commit()

        resp = await client.patch(
            f"/api/admin-users/{staff.id}",
            json={"name": "몰래수정"},
            cookies=admin_cookie(staff_token),
        )
        assert resp.status_code == 403
