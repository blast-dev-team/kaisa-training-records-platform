"""P13-3: 과정의 소속 기관 변경.

처음: 서버가 institution_id 를 조용히 무시(200 + 변경 없음).
1차 수정: 다른 기관이면 422 로 거절.
운영 결정(2026-11-19): 잘못 연결된 기관을 바로잡을 수 있어야 한다 → 변경 허용 +
연결된 일정(source)·교육이력(기관 id·기관명 스냅샷·source)을 새 기관으로 함께 맞춘다.
삭제된 이력과 다른 과정의 이력, 발급된 확인서 스냅샷은 건드리지 않는다.
"""

from decimal import Decimal

from sqlalchemy import select

from app.core.kst import now_kst, today_kst
from app.domain.audit.model import AuditLog
from app.domain.institution.model import (
    CourseSession,
    TrainingCourse,
    TrainingInstitution,
)
from app.domain.training_record.model import TrainingRecord
from tests.integration.helpers import admin_cookie, make_admin, make_trainee


async def _setup(db):
    _a, token = await make_admin(db)
    a = TrainingInstitution(name="기관A", institution_type="internal")
    b = TrainingInstitution(name="기관B", institution_type="external")
    db.add_all([a, b])
    await db.flush()
    course = TrainingCourse(institution_id=a.id, name="과정A", total_hours=Decimal(8))
    other = TrainingCourse(institution_id=a.id, name="과정Z", total_hours=Decimal(8))
    db.add_all([course, other])
    await db.flush()
    session = CourseSession(
        course_id=course.id, total_hours=Decimal(8), source="internal"
    )
    db.add(session)
    await db.flush()
    _u, t = await make_trainee(db, grade_id=None, ci_raw=None, trainee_no="TR-P13-1")

    def rec(no, c, deleted=False):
        return TrainingRecord(
            training_record_no=no,
            trainee_id=t.id,
            course_id=c.id,
            session_id=session.id if c is course else None,
            institution_id=a.id,
            course_name=c.name,
            institution_name="기관A",
            total_hours=Decimal(4),
            completed_hours=Decimal(4),
            started_at=today_kst(),
            completion_status="completed",
            source="internal",
            deleted_at=now_kst() if deleted else None,
        )

    live = rec("TRN-P13-LIVE", course)
    gone = rec("TRN-P13-DEL", course, deleted=True)
    untouched = rec("TRN-P13-OTHER", other)
    db.add_all([live, gone, untouched])
    await db.commit()
    return token, a, b, course, session, live, gone, untouched


async def test_course_institution_change_moves_sessions_and_records(client, db):
    token, a, b, course, session, live, gone, untouched = await _setup(db)
    a_id, b_id, sid = a.id, b.id, session.id
    live_id, gone_id, untouched_id, course_id = (
        live.id,
        gone.id,
        untouched.id,
        course.id,
    )

    links = await client.get(
        f"/api/courses/{course.id}/links", cookies=admin_cookie(token)
    )
    assert links.status_code == 200
    assert links.json() == {"session_count": 1, "record_count": 1}

    # course-form-dialog.tsx 가 수정 시 보내는 형태 그대로
    payload = {
        "institution_id": str(b.id),
        "name": "과정A",
        "session_name_id": None,
        "total_hours": 8,
        "description": None,
        "is_active": True,
    }
    r = await client.patch(
        f"/api/courses/{course.id}", json=payload, cookies=admin_cookie(token)
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["institution_id"] == str(b.id)
    assert body["institution_name"] == "기관B"
    assert body["is_external"] is True

    db.expire_all()
    s = await db.get(CourseSession, sid)
    assert s.source == "external"
    lv = await db.get(TrainingRecord, live_id)
    assert (lv.institution_id, lv.institution_name, lv.source) == (
        b_id,
        "기관B",
        "external",
    )
    gn = await db.get(TrainingRecord, gone_id)
    assert (gn.institution_id, gn.institution_name, gn.source) == (
        a_id,
        "기관A",
        "internal",
    )
    ut = await db.get(TrainingRecord, untouched_id)
    assert (ut.institution_id, ut.source) == (a_id, "internal")

    log = (
        await db.execute(
            select(AuditLog).where(
                AuditLog.action == "course.updated", AuditLog.entity_id == course_id
            )
        )
    ).scalar_one()
    assert log.before_data["institution_name"] == "기관A"
    assert log.after_data["institution_name"] == "기관B"
    assert log.after_data["synced_institution_records"] == 1
    assert log.after_data["synced_sessions"] == 1


async def test_course_institution_change_to_missing_or_inactive_institution(client, db):
    token, _a, b, course, *_ = await _setup(db)
    import uuid

    r = await client.patch(
        f"/api/courses/{course.id}",
        json={"institution_id": str(uuid.uuid4())},
        cookies=admin_cookie(token),
    )
    assert r.status_code == 404
    assert r.json()["message"] == "변경할 교육기관을 찾을 수 없어요"

    b.is_active = False
    await db.commit()
    r = await client.patch(
        f"/api/courses/{course.id}",
        json={"institution_id": str(b.id)},
        cookies=admin_cookie(token),
    )
    assert r.status_code == 422
    assert r.json()["message"] == "사용하지 않는 교육기관으로는 옮길 수 없어요"


async def test_course_patch_same_institution_is_noop(client, db):
    token, a, _b, course, _session, live, *_ = await _setup(db)
    a_id, live_id = a.id, live.id
    r = await client.patch(
        f"/api/courses/{course.id}",
        json={"institution_id": str(a_id), "name": "과정A-2"},
        cookies=admin_cookie(token),
    )
    assert r.status_code == 200
    db.expire_all()
    lv = await db.get(TrainingRecord, live_id)
    assert (lv.institution_id, lv.source, lv.course_name) == (
        a_id,
        "internal",
        "과정A-2",
    )
