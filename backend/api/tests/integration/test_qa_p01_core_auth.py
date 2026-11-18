"""P01 be-core-auth 회귀 테스트 — 2026-11-18 QA 헌트에서 확인된 버그가 다시 생기지 않는지 검증한다."""

import pytest

from app.core.audit import record_audit
from tests.integration.helpers import admin_cookie, make_admin


# P01-1 audit log pagination: rows written in one transaction share created_at (now() =
# txn start) and ORDER BY has no tiebreaker -> pages overlap / skip rows.
async def test_audit_log_pagination_is_stable_with_equal_created_at(db, client):
    admin, token = await make_admin(db)
    for i in range(300):
        record_audit(
            db, action=f"qa.bulk.{i:02d}", entity_type="qa", actor_admin_id=admin.id
        )
    await db.commit()

    seen: list[str] = []
    for page in range(1, 16):
        r = await client.get(
            "/api/audit-logs",
            params={"page": page, "limit": 20},
            cookies=admin_cookie(token),
        )
        assert r.status_code == 200
        seen += [it["id"] for it in r.json()["items"]]
    assert len(seen) == 300
    # every row should appear exactly once across pages
    assert len(set(seen)) == 300, (
        f"duplicates across pages: {len(seen) - len(set(seen))}"
    )


# P01-2 error envelope: unknown route / wrong method should use {code, message}
async def test_unknown_route_uses_error_envelope(client):
    r = await client.get("/api/does-not-exist")
    assert r.status_code == 404
    assert "code" in r.json(), r.json()


async def test_wrong_method_uses_error_envelope(client):
    r = await client.delete("/api/auth/me")
    assert r.status_code == 405
    assert "code" in r.json(), r.json()


# P01-4 super resetting own password via PATCH /admin-users/{self} kills own session
async def test_super_self_password_reset_keeps_current_session(db, client):
    admin, token = await make_admin(db)
    await db.commit()
    r = await client.patch(
        f"/api/admin-users/{admin.id}",
        json={"password": "NewPassw0rd123"},
        cookies=admin_cookie(token),
    )
    assert r.status_code == 200
    r2 = await client.get("/api/admin-users", cookies=admin_cookie(token))
    assert r2.status_code == 200, r2.json()


# P01-5 scheduler: after a day whose retry also failed, `retried` stays True, so the next
# day's failure gets no retry (docstring: retry once, 10 min later, each day).
async def test_scheduler_retries_once_every_failing_day(monkeypatch):
    import asyncio
    from datetime import datetime, timedelta

    from app.core import scheduler

    clock = {"now": datetime(2026, 11, 6, 12, 0, tzinfo=scheduler.KST)}
    calls = {"job": 0}
    retry_waits: list[float] = []

    async def fake_sleep(s):
        if s == 600.0:
            retry_waits.append(s)
        clock["now"] += timedelta(seconds=s)
        if clock["now"] >= datetime(2026, 11, 8, 1, 0, tzinfo=scheduler.KST):
            raise asyncio.CancelledError

    async def failing_job():
        calls["job"] += 1
        raise RuntimeError("fail")

    monkeypatch.setattr(scheduler.asyncio, "sleep", fake_sleep)
    with pytest.raises(asyncio.CancelledError):
        await scheduler.run_daily_task(
            0, 0, "qa", failing_job, run_on_start=False, now_fn=lambda: clock["now"]
        )
    # 11/7 00:00 실패 → 600s 재시도, 11/8 00:00 실패 → 600s 재시도 (매일 재시도)
    assert retry_waits == [600.0, 600.0], retry_waits
    assert calls["job"] == 4
