"""통합 — 교육내역 정렬: 수강기간순(기본)·등록순(2026-09 이후 실등록분만)."""

from datetime import date, datetime

from app.core.kst import KST
from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_record,
    make_trainee,
)

CUTOFF = datetime(2026, 9, 1, tzinfo=KST)


def _ids(resp) -> list[str]:
    assert resp.status_code == 200, resp.text
    return [i["training_record_no"] for i in resp.json()["items"]]


async def _setup(db):
    grade = await make_grade(db, code="g-sort", name="정렬등급")
    _, trainee = await make_trainee(db, grade.id, ci_raw="ci-sort", trainee_no="TR-SORT")
    return trainee


async def _admin(db):
    _, token = await make_admin(db)
    return admin_cookie(token)


class TestPeriodSort:
    async def test_default_orders_by_started_at_desc(self, client, db):
        trainee = await _setup(db)
        old = await make_record(db, trainee.id, record_no="TRN-SORT-P1")
        old.started_at = date(2025, 1, 1)
        new = await make_record(db, trainee.id, record_no="TRN-SORT-P2")
        new.started_at = date(2026, 5, 1)
        await db.commit()
        cookie = await _admin(db)

        resp = await client.get("/api/training-records", cookies=cookie)
        assert _ids(resp) == ["TRN-SORT-P2", "TRN-SORT-P1"]

    async def test_null_started_at_lasts(self, client, db):
        trainee = await _setup(db)
        none_rec = await make_record(db, trainee.id, record_no="TRN-SORT-N0")
        none_rec.started_at = None
        dated = await make_record(db, trainee.id, record_no="TRN-SORT-D1")
        dated.started_at = date(2026, 1, 1)
        await db.commit()
        cookie = await _admin(db)

        resp = await client.get("/api/training-records", cookies=cookie)
        assert _ids(resp) == ["TRN-SORT-D1", "TRN-SORT-N0"]


class TestRegistrationSort:
    async def test_excludes_migration_data_before_cutoff(self, client, db):
        trainee = await _setup(db)
        migrated = await make_record(db, trainee.id, record_no="TRN-SORT-MIG")
        migrated.created_at = datetime(2026, 5, 31, tzinfo=KST)
        fresh = await make_record(db, trainee.id, record_no="TRN-SORT-FRESH")
        fresh.created_at = datetime(2026, 9, 15, tzinfo=KST)
        await db.commit()
        cookie = await _admin(db)

        resp = await client.get(
            "/api/training-records", params={"sort": "registration"}, cookies=cookie
        )
        assert _ids(resp) == ["TRN-SORT-FRESH"]

    async def test_includes_all_in_period_sort(self, client, db):
        """같은 데이터가 수강기간순에선 전체 보인다 — 등록순만 필터링한다."""
        trainee = await _setup(db)
        migrated = await make_record(db, trainee.id, record_no="TRN-SORT-MIG2")
        migrated.created_at = datetime(2026, 5, 31, tzinfo=KST)
        await db.commit()
        cookie = await _admin(db)

        resp = await client.get("/api/training-records", cookies=cookie)
        assert "TRN-SORT-MIG2" in _ids(resp)

    async def test_invalid_sort_422(self, client, db):
        cookie = await _admin(db)
        resp = await client.get(
            "/api/training-records",
            params={"sort": "weird"},
            cookies=cookie,
        )
        assert resp.status_code == 422
