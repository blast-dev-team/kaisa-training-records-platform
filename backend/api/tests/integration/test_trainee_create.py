"""통합 — 교육생 어드민 수기 등록."""

import re
import uuid

from sqlalchemy import select

from app.core.crypto import decrypt_field, name_hash
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
        # 이름도 암호화 저장 — Fernet 토큰 + 64hex blind index
        assert row.name_encrypted != "수기등록"
        assert decrypt_field(row.name_encrypted) == "수기등록"
        assert re.fullmatch(r"[0-9a-f]{64}", row.name_hash)
        assert row.name_hash == name_hash("수기등록")

    async def test_create_unknown_grade_404(self, client, db):
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.post(
            "/api/trainees",
            json={"name": "등급없음", "membership_grade_id": str(uuid.uuid4())},
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 404


class TestTraineeNameSearchExactMatch:
    """이름은 암호화 저장이라 '전체 이름 일치'만 검색된다 (부분 검색 불가)."""

    async def test_full_name_hits_partial_misses(self, client, db):
        grade = await make_grade(db, code="g-exact", name="검색등급")
        _, admin_token = await make_admin(db)
        await client.post(
            "/api/trainees",
            json={"name": "홍길동", "membership_grade_id": str(grade.id)},
            cookies=admin_cookie(admin_token),
        )
        await db.commit()

        # 전체 이름 — 검색됨
        resp = await client.get(
            "/api/trainees?search=홍길동", cookies=admin_cookie(admin_token)
        )
        assert resp.status_code == 200
        assert [i["name"] for i in resp.json()["items"]] == ["홍길동"]

        # 부분 이름 — 이름으로는 못 찾는다 (trainee_no·cert_no 부분 검색과 대비)
        resp = await client.get(
            "/api/trainees?search=홍길", cookies=admin_cookie(admin_token)
        )
        assert resp.status_code == 200
        assert resp.json()["items"] == []

        # 공백·정규화 차이 — normalize_name 로 흡수돼 검색된다
        resp = await client.get(
            "/api/trainees?search=%20%ED%99%8D%EA%B8%B8%EB%8F%99%20",
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200
        assert [i["name"] for i in resp.json()["items"]] == ["홍길동"]
