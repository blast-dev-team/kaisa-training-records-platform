"""통합 — 교육생 어드민 수기 등록."""

import uuid

from sqlalchemy import select

from app.domain.trainee.model import Trainee
from tests.integration.helpers import admin_cookie, make_admin, make_grade


class TestTraineeCreate:
    async def test_create_201_approved_with_optional_fields(self, client, db):
        grade = await make_grade(db, code="g-manual", name="수기등급")
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.post(
            "/api/trainees",
            json={
                "name": "수기등록",
                "birth_date": "1990-03-15",
                "phone": "01099998888",
                "email": "manual@example.com",
                "membership_grade_id": str(grade.id),
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "수기등록"
        assert body["birth_date"] == "1990-03-15"
        assert body["review_status"] == "approved"  # 수기 등록 = 신원 확인 완료 가정
        assert body["grade_name"] == grade.name
        assert body["trainee_no"] is not None
        assert body["phone_masked"].startswith("010-****")

        row = (
            await db.execute(select(Trainee).where(Trainee.id == uuid.UUID(body["id"])))
        ).scalar_one()
        assert row.phone_encrypted  # 평문 저장 아님

    async def test_create_unknown_grade_404(self, client, db):
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.post(
            "/api/trainees",
            json={"name": "등급없음", "membership_grade_id": str(uuid.uuid4())},
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 404
