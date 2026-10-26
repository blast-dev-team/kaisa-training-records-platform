"""통합 — 초대 이메일(화이트리스트) 관리는 총관리자(super) 전용.

일반 관리자(staff)가 초대 이메일을 추가하면 새 관리자 계정을 스스로 늘릴 수 있다.
조회·추가·삭제 모두 require_super 로 막는다.
"""

import uuid

from tests.integration.helpers import admin_cookie, make_admin


class TestAllowedEmailPermission:
    async def test_staff_cannot_manage_allowed_emails(self, client, db):
        _, token = await make_admin(db, email="staff@example.com", role="staff")
        await db.commit()
        cookies = admin_cookie(token)

        resp = await client.get("/api/admin-allowed-emails", cookies=cookies)
        assert resp.status_code == 403

        resp = await client.post(
            "/api/admin-allowed-emails",
            json={"email": "intruder@example.com"},
            cookies=cookies,
        )
        assert resp.status_code == 403

        resp = await client.delete(
            f"/api/admin-allowed-emails/{uuid.uuid4()}", cookies=cookies
        )
        assert resp.status_code == 403

    async def test_super_can_add_allowed_email(self, client, db):
        _, token = await make_admin(db, email="super@example.com", role="super")
        await db.commit()

        resp = await client.post(
            "/api/admin-allowed-emails",
            json={"email": "invitee@example.com"},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 201
