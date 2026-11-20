"""2026-11-19 운영 결정 회귀.

1. 오류 응답은 사용자가 이해할 수 있는 한국어 — pydantic 영문 원문·영문 필드명 비노출,
   음수·상한 초과·빈 값 시수는 상황별 문구 (P06-5 · P06-4 · P04-4).
2. 구분(source): 지정된 사내 기관만 internal, 그 외(외부·구분 미지정)는 external — '이관' 미사용.
3. 없는 대상 404 는 무엇을 못 찾았는지 알려 준다.
"""

import re
import uuid
from decimal import Decimal

from app.core.kst import today_kst
from app.domain.institution.model import (
    CourseSession,
    TrainingCourse,
    TrainingInstitution,
)
from tests.integration.helpers import admin_cookie, make_admin, make_trainee

HANGUL = re.compile(r"[가-힣]")


async def _course(db, inst_type):
    _a, token = await make_admin(db)
    inst = TrainingInstitution(name="기관X", institution_type=inst_type)
    db.add(inst)
    await db.flush()
    course = TrainingCourse(
        institution_id=inst.id, name="과정X", total_hours=Decimal(8)
    )
    db.add(course)
    await db.flush()
    session = CourseSession(
        course_id=course.id,
        started_at=today_kst(),
        ended_at=today_kst(),
        total_hours=Decimal(8),
        recognized_hours=Decimal(8),
    )
    db.add(session)
    await db.commit()
    return token, inst, course, session


def _assert_friendly(body):
    assert HANGUL.search(body["message"]), body
    for e in body.get("errors", []):
        assert HANGUL.search(e["message"]), body
        assert (
            "Input should" not in e["message"] and "Value error" not in e["message"]
        ), body


# ── 1. 상황별 한국어 검증 문구 ────────────────────────────────────────────────


async def test_negative_hours_message_session_course_record(client, db):
    token, _inst, course, session = await _course(db, "external")
    cookie = admin_cookie(token)

    r = await client.patch(
        f"/api/course-sessions/{session.id}", json={"total_hours": -8}, cookies=cookie
    )
    assert r.status_code == 422
    assert r.json()["message"] == "총 시수는 0 이상이어야 해요"
    _assert_friendly(r.json())

    r = await client.patch(
        f"/api/courses/{course.id}", json={"total_hours": -8}, cookies=cookie
    )
    assert r.status_code == 422
    assert r.json()["message"] == "총 시수는 0 이상이어야 해요"

    _u, t = await make_trainee(db, grade_id=None, ci_raw=None, trainee_no="TR-D1119-1")
    await db.commit()
    r = await client.post(
        "/api/training-records",
        json={"trainee_id": str(t.id), "course_id": str(course.id), "total_hours": -8},
        cookies=cookie,
    )
    assert r.status_code == 422
    assert r.json()["message"] == "총 시수는 0 이상이어야 해요"
    assert r.json()["errors"][0]["field"] == "body.total_hours"


async def test_over_max_and_null_and_type_messages(client, db):
    token, _inst, course, _session = await _course(db, "internal")
    cookie = admin_cookie(token)
    r = await client.patch(
        f"/api/courses/{course.id}", json={"total_hours": 10**7}, cookies=cookie
    )
    assert r.json()["message"] == "총 시수는 999,999.99 이하로 입력해 주세요"
    r = await client.patch(
        f"/api/courses/{course.id}", json={"total_hours": None}, cookies=cookie
    )
    assert r.json()["message"] == "총 시수는 비울 수 없어요"
    r = await client.patch(
        f"/api/courses/{course.id}", json={"total_hours": "여덟"}, cookies=cookie
    )
    assert r.json()["message"] == "총 시수는 숫자로 입력해 주세요"
    r = await client.patch(
        f"/api/courses/{course.id}", json={"name": ""}, cookies=cookie
    )
    assert r.json()["message"] == "이름을 입력해 주세요"
    r = await client.get(
        "/api/training-records", params={"trainee_id": "not-a-uuid"}, cookies=cookie
    )
    assert r.status_code == 422
    _assert_friendly(r.json())


async def test_unknown_route_and_missing_auth_are_korean(client, db):
    r = await client.get("/api/does-not-exist")
    assert r.json() == {"code": "NOT_FOUND", "message": "요청한 정보를 찾을 수 없어요"}
    r = await client.get("/api/courses")
    assert HANGUL.search(r.json()["message"]), r.json()


async def test_not_found_names_the_missing_thing(client, db):
    _a, token = await make_admin(db)
    await db.commit()
    cookie = admin_cookie(token)
    missing = uuid.uuid4()
    r = await client.get(f"/api/courses/{missing}", cookies=cookie)
    assert r.status_code == 404 and r.json()["message"] == "교육과정을 찾을 수 없어요"
    r = await client.get(f"/api/institutions/{missing}", cookies=cookie)
    assert r.status_code == 404 and r.json()["message"] == "교육기관을 찾을 수 없어요"
    r = await client.get(f"/api/trainees/{missing}", cookies=cookie)
    assert r.status_code == 404 and r.json()["message"] == "교육생을 찾을 수 없어요"


# ── 2. 구분 규칙 — 사내가 아니면 외부 ─────────────────────────────────────────


async def test_unset_institution_type_counts_as_external(client, db):
    token, _inst, course, _session = await _course(db, None)
    cookie = admin_cookie(token)
    _u, t = await make_trainee(db, grade_id=None, ci_raw=None, trainee_no="TR-D1119-2")
    await db.commit()
    r = await client.post(
        "/api/training-records",
        json={
            "trainee_id": str(t.id),
            "course_id": str(course.id),
            "started_at": str(today_kst()),
        },
        cookies=cookie,
    )
    assert r.status_code == 201, r.text
    assert r.json()["source"] == "external"


async def test_internal_institution_stays_internal_and_type_change_follows(client, db):
    token, inst, course, _session = await _course(db, "internal")
    cookie = admin_cookie(token)
    _u, t = await make_trainee(db, grade_id=None, ci_raw=None, trainee_no="TR-D1119-3")
    await db.commit()
    r = await client.post(
        "/api/training-records",
        json={
            "trainee_id": str(t.id),
            "course_id": str(course.id),
            "started_at": str(today_kst()),
        },
        cookies=cookie,
    )
    assert r.json()["source"] == "internal"
    rid = r.json()["id"]
    r = await client.patch(
        f"/api/institutions/{inst.id}",
        json={"institution_type": "external"},
        cookies=cookie,
    )
    assert r.status_code == 200
    r = await client.get(f"/api/training-records/{rid}", cookies=cookie)
    assert r.json()["source"] == "external"
