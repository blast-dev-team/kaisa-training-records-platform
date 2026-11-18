"""P04 be-training-record 회귀 테스트 — 2026-11-18 QA 헌트에서 확인된 버그가 다시 생기지 않는지 검증한다."""

import uuid
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import func, select

from app.core.kst import today_kst
from app.domain.institution.model import TrainingCourse, TrainingInstitution
from app.domain.training_record.model import TrainingRecord
from tests.integration.helpers import admin_cookie, make_admin, make_trainee

RECENT = today_kst() - timedelta(days=30)


async def _call(coro):
    """Return status code; an unhandled server exception counts as 500."""
    try:
        resp = await coro
        return resp.status_code, resp
    except Exception as exc:  # ASGITransport re-raises app exceptions
        return 500, exc


async def _setup(db):
    _, trainee = await make_trainee(
        db, None, ci_raw=None, name="김사공", trainee_no="TR-P04"
    )
    ext = TrainingInstitution(name="외부기관P04", institution_type="external")
    inte = TrainingInstitution(name="감리협회P04", institution_type="internal")
    db.add_all([ext, inte])
    await db.flush()
    _, token = await make_admin(db, email="p04@example.com")
    return trainee, ext, inte, admin_cookie(token)


async def _record(db, trainee, inst, hours="8", name="기존과정"):
    rec = TrainingRecord(
        training_record_no=f"TRN-P04-{uuid.uuid4().hex[:8]}",
        trainee_id=trainee.id,
        institution_id=inst.id,
        course_name=name,
        institution_name=inst.name,
        total_hours=Decimal(hours),
        completed_hours=Decimal(hours),
        started_at=RECENT,
        ended_at=RECENT,
        completion_status="completed",
    )
    db.add(rec)
    await db.flush()
    return rec


async def test_p04_1_patch_course_change_updates_snapshot(client, db):
    trainee, ext, inte, cookie = await _setup(db)
    rec = await _record(db, trainee, inte, name="옛과정")
    new_course = TrainingCourse(institution_id=ext.id, name="새과정")
    db.add(new_course)
    await db.commit()
    resp = await client.patch(
        f"/api/training-records/{rec.id}",
        json={"course_id": str(new_course.id), "institution_id": str(ext.id)},
        cookies=cookie,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["course_name"] == "새과정"  # actual: 옛과정
    assert body["institution_name"] == ext.name  # actual: 감리협회P04


async def test_p04_2_patch_total_hours_null_is_4xx(client, db):
    trainee, ext, _, cookie = await _setup(db)
    rec = await _record(db, trainee, ext)
    await db.commit()
    code, _ = await _call(
        client.patch(
            f"/api/training-records/{rec.id}",
            json={"total_hours": None},
            cookies=cookie,
        )
    )
    assert 400 <= code < 500, code


async def test_p04_3_create_rejects_ended_before_started(client, db):
    trainee, ext, _, cookie = await _setup(db)
    await db.commit()
    resp = await client.post(
        "/api/training-records",
        json={
            "trainee_id": str(trainee.id),
            "institution_id": str(ext.id),
            "course_name": "역순",
            "total_hours": "4",
            "started_at": "2026-10-10",
            "ended_at": "2026-10-01",
        },
        cookies=cookie,
    )
    assert resp.status_code in (400, 422), resp.text


async def test_p04_4_negative_hours_rejected_and_cannot_bypass_cap(client, db):
    trainee, ext, _, cookie = await _setup(db)
    await _record(db, trainee, ext, hours="16")
    await db.commit()
    base = {
        "trainee_id": str(trainee.id),
        "institution_id": str(ext.id),
        "started_at": RECENT.isoformat(),
        "ended_at": RECENT.isoformat(),
    }
    neg = await client.post(
        "/api/training-records",
        json={**base, "course_name": "음수", "total_hours": "-8"},
        cookies=cookie,
    )
    pos = await client.post(
        "/api/training-records",
        json={**base, "course_name": "추가", "total_hours": "8"},
        cookies=cookie,
    )
    total = (
        await db.execute(
            select(func.sum(TrainingRecord.total_hours)).where(
                TrainingRecord.trainee_id == trainee.id, TrainingRecord.total_hours > 0
            )
        )
    ).scalar_one()
    assert neg.status_code in (400, 422), neg.text  # actual: 201
    assert total <= 16, (pos.status_code, total)  # actual: 24 positive hours


async def test_p04_5_import_confirm_overflow_hours_is_row_error(client, db):
    trainee, _, inte, cookie = await _setup(db)
    await db.commit()
    day = RECENT.strftime("%Y.%m.%d")
    base = {
        "name": "김사공",
        "institution": inte.name,
        "start_date": day,
        "end_date": day,
        "trainee_id": str(trainee.id),
    }
    code, resp = await _call(
        client.post(
            "/api/training-records/import-confirm",
            json={
                "rows": [
                    {
                        **base,
                        "row_number": 2,
                        "subject": "정상",
                        "hours_total": "8",
                        "hours_recog": "8",
                    },
                    {
                        **base,
                        "row_number": 3,
                        "subject": "오버",
                        "hours_total": "1000000",
                        "hours_recog": "1000000",
                    },
                ]
            },
            cookies=cookie,
        )
    )
    assert code == 200, resp  # actual: 500, whole batch lost
    assert resp.json()["created"] == 1


async def test_p04_6_create_with_internal_course_only_not_counted_external(client, db):
    trainee, ext, inte, cookie = await _setup(db)
    await _record(db, trainee, ext, hours="16")
    course = TrainingCourse(
        institution_id=inte.id, name="협회과정", total_hours=Decimal(4)
    )
    db.add(course)
    await db.commit()
    resp = await client.post(
        "/api/training-records",
        json={
            "trainee_id": str(trainee.id),
            "course_id": str(course.id),
            "started_at": RECENT.isoformat(),
            "ended_at": RECENT.isoformat(),
        },
        cookies=cookie,
    )
    # doc: course_id 연결 시 과정명·기관명·total_hours 는 마스터에서 스냅샷
    assert resp.status_code == 201, resp.text  # actual: 400 기관명 필요
    assert resp.json()["institution_id"] == str(inte.id)


async def test_p04_7_patch_unknown_institution_is_404(client, db):
    trainee, ext, _, cookie = await _setup(db)
    rec = await _record(db, trainee, ext)
    await db.commit()
    code, _ = await _call(
        client.patch(
            f"/api/training-records/{rec.id}",
            json={"institution_id": str(uuid.uuid4())},
            cookies=cookie,
        )
    )
    assert 400 <= code < 500, code


async def test_p04_8_bulk_update_status_null_is_4xx(client, db):
    trainee, ext, _, cookie = await _setup(db)
    rec = await _record(db, trainee, ext)
    await db.commit()
    code, _ = await _call(
        client.patch(
            "/api/training-records/bulk",
            json={"updates": [{"id": str(rec.id), "completion_status": None}]},
            cookies=cookie,
        )
    )
    assert 400 <= code < 500, code


async def test_p04_9_patch_update_ended_before_started_rejected(client, db):
    trainee, ext, _, cookie = await _setup(db)
    rec = await _record(db, trainee, ext)
    await db.commit()
    resp = await client.patch(
        f"/api/training-records/{rec.id}",
        json={"ended_at": (RECENT - timedelta(days=5)).isoformat()},
        cookies=cookie,
    )
    assert resp.status_code in (400, 422), resp.text


async def test_p04_10_import_confirm_unreadable_hours_not_saved_as_zero(client, db):
    """운영 결정(2026-11-19): 시수 셀은 숫자만 읽어 해석한다 — '8시간' → 8.
    숫자가 없거나 여러 개면 행 오류. 어느 쪽이든 0시간으로 조용히 저장되지 않는다."""
    trainee, ext, _, cookie = await _setup(db)
    await db.commit()
    day = RECENT.strftime("%Y.%m.%d")

    def row(n, subject, total, recog):
        return {
            "row_number": n,
            "name": "김사공",
            "institution": ext.name,
            "subject": subject,
            "start_date": day,
            "end_date": day,
            "hours_total": total,
            "hours_recog": recog,
            "trainee_id": str(trainee.id),
        }

    resp = await client.post(
        "/api/training-records/import-confirm",
        json={
            "rows": [
                row(2, "숫자추출", "8시간", "8시간"),
                row(3, "여러숫자", "8시간 30분", "8시간 30분"),
                row(4, "숫자없음", "시간", ""),
            ]
        },
        cookies=cookie,
    )
    body = resp.json()
    assert body["created"] == 1, body
    failed = {f["row_number"]: f["error"] for f in body["failed"]}
    assert set(failed) == {3, 4}, body
    assert "숫자가 여러 개" in failed[3]
    assert "숫자가 없어요" in failed[4]
    hours = (
        await db.execute(
            select(TrainingRecord.total_hours).where(
                TrainingRecord.course_name == "숫자추출"
            )
        )
    ).scalar_one()
    assert hours == Decimal(8)
