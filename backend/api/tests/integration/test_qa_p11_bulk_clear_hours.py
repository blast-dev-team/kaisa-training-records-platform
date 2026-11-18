"""P11-6 — ADMIN 일괄 수정 모달은 '빈 칸으로 저장하면 값이 지워져요'라며 총시수 빈칸을 total_hours:null 로 보낸다.
BE PATCH /training-records/bulk 가 이를 4xx 로 거절하지 않고 500 으로 터지는지 확인 (FE 가 보내는 실제 payload)."""

from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_record,
    make_trainee,
)


async def test_bulk_patch_total_hours_null_is_not_500(db, client):
    _, trainee = await make_trainee(
        db, None, ci_raw=None, name="김일괄", trainee_no="TR-P11"
    )
    rec = await make_record(db, trainee.id, record_no="TRN-P11-0001")
    _, token = await make_admin(db, email="p11@example.com")
    await db.commit()
    try:
        resp = await client.patch(
            "/api/training-records/bulk",
            json={"updates": [{"id": str(rec.id), "total_hours": None}]},
            cookies=admin_cookie(token),
        )
        code = resp.status_code
    except Exception as exc:  # ASGITransport re-raises unhandled app exceptions
        code = 500
        print("unhandled:", type(exc).__name__, str(exc)[:200])
    assert code != 500 and code < 500, code


async def test_probe_datetime_serialization_offset(db, client):
    """Probe (not a bug assertion): how BE serializes timestamptz — used by P11-7 (FE slices first 10 chars)."""
    _, trainee = await make_trainee(
        db, None, ci_raw=None, name="김시간", trainee_no="TR-P11B"
    )
    await make_record(db, trainee.id, record_no="TRN-P11-0002")
    _, token = await make_admin(db, email="p11b@example.com")
    await db.commit()
    resp = await client.get("/api/training-records", cookies=admin_cookie(token))
    print("CREATED_AT:", resp.json()["items"][0]["created_at"])
