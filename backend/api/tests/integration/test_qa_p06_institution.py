"""P06 be-institution 회귀 테스트 — 2026-11-18 QA 헌트에서 확인된 버그가 다시 생기지 않는지 검증한다."""

from datetime import timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.kst import now_kst, today_kst
from app.domain.institution.model import (
    CourseSession,
    SessionName,
    TrainingCourse,
    TrainingInstitution,
)
from app.domain.training_record.model import TrainingRecord
from tests.integration.helpers import admin_cookie, make_admin, make_trainee


async def _setup(db, inst_type="internal", code=None):
    _a, token = await make_admin(db)
    inst = TrainingInstitution(
        name="기관A", institution_type=inst_type, institution_code=code
    )
    db.add(inst)
    await db.flush()
    course = TrainingCourse(
        institution_id=inst.id, name="과정A", total_hours=Decimal(8)
    )
    db.add(course)
    await db.flush()
    start = today_kst() - timedelta(days=10)
    session = CourseSession(
        course_id=course.id,
        started_at=start,
        ended_at=start,
        total_hours=Decimal(8),
        recognized_hours=Decimal(8),
        source="internal" if inst_type == "internal" else "external",
    )
    db.add(session)
    await db.commit()
    return token, inst, course, session


# ── null PATCH on NOT NULL columns → should be 4xx, not 500 ──────────────────


async def test_institution_patch_name_null_not_500(client, db):
    token, inst, _c, _s = await _setup(db)
    r = await client.patch(
        f"/api/institutions/{inst.id}", json={"name": None}, cookies=admin_cookie(token)
    )
    assert r.status_code < 500, r.text


async def test_institution_patch_is_active_null_not_500(client, db):
    token, inst, _c, _s = await _setup(db)
    r = await client.patch(
        f"/api/institutions/{inst.id}",
        json={"is_active": None},
        cookies=admin_cookie(token),
    )
    assert r.status_code < 500, r.text


async def test_course_patch_total_hours_null_not_500(client, db):
    token, _i, course, _s = await _setup(db)
    r = await client.patch(
        f"/api/courses/{course.id}",
        json={"total_hours": None},
        cookies=admin_cookie(token),
    )
    assert r.status_code < 500, r.text


async def test_course_patch_name_null_not_500(client, db):
    token, _i, course, _s = await _setup(db)
    r = await client.patch(
        f"/api/courses/{course.id}", json={"name": None}, cookies=admin_cookie(token)
    )
    assert r.status_code < 500, r.text


async def test_session_patch_total_hours_null_not_500(client, db):
    token, _i, _c, session = await _setup(db)
    r = await client.patch(
        f"/api/course-sessions/{session.id}",
        json={"total_hours": None},
        cookies=admin_cookie(token),
    )
    assert r.status_code < 500, r.text


async def test_session_bulk_patch_is_active_null_not_500(client, db):
    token, _i, _c, session = await _setup(db)
    r = await client.patch(
        "/api/course-sessions/bulk",
        json={"items": [{"id": str(session.id), "is_active": None}]},
        cookies=admin_cookie(token),
    )
    assert r.status_code < 500, r.text


async def test_session_name_patch_is_active_null_not_500(client, db):
    _a, token = await make_admin(db)
    sn = SessionName(name="1회차")
    db.add(sn)
    await db.commit()
    r = await client.patch(
        f"/api/session-names/{sn.id}",
        json={"is_active": None},
        cookies=admin_cookie(token),
    )
    assert r.status_code < 500, r.text


# ── uniqueness on PATCH (create returns 409, update should too) ─────────────


async def test_institution_patch_duplicate_code_409(client, db):
    token, _inst, _c, _s = await _setup(db, code="INST-1")
    other = TrainingInstitution(
        name="기관B", institution_type="internal", institution_code="INST-2"
    )
    db.add(other)
    await db.commit()
    r = await client.patch(
        f"/api/institutions/{other.id}",
        json={"institution_code": "INST-1"},
        cookies=admin_cookie(token),
    )
    assert r.status_code == 409, (r.status_code, r.text)


async def test_course_patch_duplicate_code_409(client, db):
    token, inst, course, _s = await _setup(db)
    course.course_code = "C-1"
    other = TrainingCourse(institution_id=inst.id, name="과정B", course_code="C-2")
    db.add(other)
    await db.commit()
    r = await client.patch(
        f"/api/courses/{other.id}",
        json={"course_code": "C-1"},
        cookies=admin_cookie(token),
    )
    assert r.status_code == 409, (r.status_code, r.text)


# ── FK on unknown session_name_id → should be 404/422, not 500 ──────────────


async def test_course_create_unknown_session_name_not_500(client, db):
    token, inst, _c, _s = await _setup(db)
    r = await client.post(
        "/api/courses",
        json={
            "institution_id": str(inst.id),
            "name": "새과정",
            "session_name_id": "00000000-0000-0000-0000-000000000001",
        },
        cookies=admin_cookie(token),
    )
    assert r.status_code < 500, r.text


async def test_course_patch_unknown_session_name_not_500(client, db):
    token, _i, course, _s = await _setup(db)
    r = await client.patch(
        f"/api/courses/{course.id}",
        json={"session_name_id": "00000000-0000-0000-0000-000000000001"},
        cookies=admin_cookie(token),
    )
    assert r.status_code < 500, r.text


# ── hours validation ────────────────────────────────────────────────────────


async def test_session_create_negative_hours_rejected(client, db):
    token, _i, course, _s = await _setup(db)
    r = await client.post(
        "/api/course-sessions",
        json={
            "course_id": str(course.id),
            "started_at": str(today_kst()),
            "total_hours": "-8",
        },
        cookies=admin_cookie(token),
    )
    assert r.status_code in (400, 422), (r.status_code, r.text)


async def test_course_create_negative_hours_rejected(client, db):
    token, inst, _c, _s = await _setup(db)
    r = await client.post(
        "/api/courses",
        json={"institution_id": str(inst.id), "name": "음수과정", "total_hours": "-3"},
        cookies=admin_cookie(token),
    )
    assert r.status_code in (400, 422), (r.status_code, r.text)


async def test_session_create_hours_overflow_not_500(client, db):
    token, _i, course, _s = await _setup(db)
    r = await client.post(
        "/api/course-sessions",
        json={"course_id": str(course.id), "total_hours": "100000000"},
        cookies=admin_cookie(token),
    )
    assert r.status_code < 500, r.text


async def test_negative_external_session_lets_trainee_exceed_16h_cap(client, db):
    """Impact of missing ge=0: a -8h external session lowers the 3-year sum so a 20h
    external session can then be attached to a trainee who already had 4h... total real > 16."""
    token, _i, course, neg = await _setup(db, inst_type="external")
    _u, t = await make_trainee(db, grade_id=None, ci_raw=None, trainee_no="TR-P06-1")
    neg.total_hours = Decimal(-8)
    neg.recognized_hours = Decimal(-8)
    big = CourseSession(
        course_id=course.id,
        started_at=today_kst() - timedelta(days=5),
        total_hours=Decimal(20),
        recognized_hours=Decimal(20),
        source="external",
    )
    db.add(big)
    await db.commit()
    # step 1: attach the negative session (allowed — it lowers the sum)
    r1 = await client.post(
        "/api/training-records/bulk",
        json={"session_id": str(neg.id), "trainee_ids": [str(t.id)]},
        cookies=admin_cookie(token),
    )
    assert r1.status_code == 200, r1.text
    # step 2: attach a 20h external session — intended: excluded by 16h cap
    r2 = await client.post(
        "/api/training-records/bulk",
        json={"session_id": str(big.id), "trainee_ids": [str(t.id)]},
        cookies=admin_cookie(token),
    )
    assert r2.status_code == 200, r2.text
    assert r2.json().get("created") == 0, r2.json()


# ── attach soft-deleted trainee ─────────────────────────────────────────────


async def test_attach_soft_deleted_trainee_not_created(client, db):
    token, _i, _c, session = await _setup(db)
    _u, t = await make_trainee(db, grade_id=None, ci_raw=None, trainee_no="TR-P06-DEL")
    t.deleted_at = now_kst()
    await db.commit()
    r = await client.post(
        "/api/training-records/bulk",
        json={"session_id": str(session.id), "trainee_ids": [str(t.id)]},
        cookies=admin_cookie(token),
    )
    rows = (
        (
            await db.execute(
                select(TrainingRecord).where(TrainingRecord.trainee_id == t.id)
            )
        )
        .scalars()
        .all()
    )
    assert rows == [], (r.status_code, r.text)


# ── snapshot sync on institution rename (spec-ambiguous; course rename does sync) ──


async def test_institution_rename_syncs_record_snapshot(client, db):
    token, inst, _c, session = await _setup(db)
    _u, t = await make_trainee(db, grade_id=None, ci_raw=None, trainee_no="TR-P06-REN")
    await db.commit()
    r = await client.post(
        "/api/training-records/bulk",
        json={"session_id": str(session.id), "trainee_ids": [str(t.id)]},
        cookies=admin_cookie(token),
    )
    assert r.status_code == 200, r.text
    r = await client.patch(
        f"/api/institutions/{inst.id}",
        json={"name": "기관A-개명"},
        cookies=admin_cookie(token),
    )
    assert r.status_code == 200
    rec = (
        await db.execute(
            select(TrainingRecord.institution_name).where(
                TrainingRecord.trainee_id == t.id
            )
        )
    ).scalar_one()
    assert rec == "기관A-개명", rec


# ── institution_type change — '이관'(legacy_import) 표시는 더 이상 보존하지 않는다 ──
# 운영 결정(2026-11-19): 구분은 기관 구분 하나로 — 사내가 아니면 외부.


async def test_institution_type_change_rederives_former_legacy_import_source(
    client, db
):
    token, inst, course, _s = await _setup(db, inst_type="internal")
    _u, t = await make_trainee(db, grade_id=None, ci_raw=None, trainee_no="TR-P06-LEG")
    rec = TrainingRecord(
        training_record_no="TRN-P06-LEG",
        trainee_id=t.id,
        course_id=course.id,
        institution_id=inst.id,
        course_name="과정A",
        institution_name="기관A",
        total_hours=Decimal(4),
        completed_hours=Decimal(4),
        completion_status="completed",
        source="legacy_import",
    )
    db.add(rec)
    await db.commit()
    r = await client.patch(
        f"/api/institutions/{inst.id}",
        json={"institution_type": "external"},
        cookies=admin_cookie(token),
    )
    assert r.status_code == 200
    src = (
        await db.execute(
            select(TrainingRecord.source).where(TrainingRecord.id == rec.id)
        )
    ).scalar_one()
    assert src == "external", src


# ── institution_type change leaves course_sessions.source stale ─────────────


async def test_institution_type_change_syncs_session_source(client, db):
    token, inst, _c, session = await _setup(db, inst_type="internal")
    r = await client.patch(
        f"/api/institutions/{inst.id}",
        json={"institution_type": "external"},
        cookies=admin_cookie(token),
    )
    assert r.status_code == 200
    r = await client.get(
        f"/api/course-sessions/{session.id}", cookies=admin_cookie(token)
    )
    body = r.json()
    assert body["source"] == body["institution_type"] == "external", body
