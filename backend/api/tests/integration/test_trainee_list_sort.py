"""통합 — 교육생 목록 정렬 (등록일·수정일·연간 만료일)."""

from datetime import datetime

from app.core.kst import KST, ensure_kst
from tests.integration.helpers import admin_cookie, make_admin, make_grade, make_trainee


def _seed_times(trainee, created: datetime, updated: datetime):
    trainee.created_at = ensure_kst(created)
    trainee.updated_at = ensure_kst(updated)


async def _seed_three(db):
    """등록일 A<C<B, 수정일 B<A<C 로 어긋나게 심는다 — 키별 정렬이 갈리는지 확인용."""
    grade = await make_grade(db, code="g-sort", name="정렬등급")
    created = {
        "A": datetime(2026, 9, 1, 12, 0, tzinfo=KST),
        "B": datetime(2026, 9, 3, 12, 0, tzinfo=KST),
        "C": datetime(2026, 9, 2, 12, 0, tzinfo=KST),
    }
    updated = {
        "A": datetime(2026, 9, 5, 12, 0, tzinfo=KST),
        "B": datetime(2026, 9, 4, 12, 0, tzinfo=KST),
        "C": datetime(2026, 9, 6, 12, 0, tzinfo=KST),
    }
    for key in ("A", "B", "C"):
        _, t = await make_trainee(
            db, grade.id, ci_raw=None, name=f"정렬{key}", trainee_no=f"SORTR-{key}"
        )
        _seed_times(t, created[key], updated[key])


class TestTraineeListSort:
    async def test_created_at_sort(self, client, db):
        await _seed_three(db)
        _, admin_token = await make_admin(db)
        await db.commit()

        async def names(**params):
            resp = await client.get(
                "/api/trainees", params=params, cookies=admin_cookie(admin_token)
            )
            assert resp.status_code == 200
            return [r["name"] for r in resp.json()["items"]]

        desc = await names(sort="created_at", order="desc")
        asc = await names(sort="created_at", order="asc")
        assert desc == ["정렬B", "정렬C", "정렬A"]
        assert asc == ["정렬A", "정렬C", "정렬B"]

    async def test_updated_at_sort(self, client, db):
        await _seed_three(db)
        _, admin_token = await make_admin(db)
        await db.commit()

        async def names(**params):
            resp = await client.get(
                "/api/trainees", params=params, cookies=admin_cookie(admin_token)
            )
            assert resp.status_code == 200
            return [r["name"] for r in resp.json()["items"]]

        desc = await names(sort="updated_at", order="desc")
        asc = await names(sort="updated_at", order="asc")
        assert desc == ["정렬C", "정렬A", "정렬B"]
        assert asc == ["정렬B", "정렬A", "정렬C"]

    async def test_invalid_sort_422(self, client, db):
        await _seed_three(db)
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.get(
            "/api/trainees",
            params={"sort": "name", "order": "desc"},
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 422

    async def test_default_order_is_registered_desc(self, client, db):
        """정렬 파라미터 없음 — 기본 created_at desc 유지."""
        await _seed_three(db)
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.get("/api/trainees", cookies=admin_cookie(admin_token))
        assert resp.status_code == 200
        names = [r["name"] for r in resp.json()["items"]]
        assert names == ["정렬B", "정렬C", "정렬A"]
