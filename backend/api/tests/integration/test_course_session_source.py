"""통합 — 교육 일정 내역 구분(source)은 소속 기관 구분에 고정된다."""

import uuid
from decimal import Decimal as D

from app.domain.institution.model.training_course import TrainingCourse
from app.domain.institution.model.training_institution import TrainingInstitution
from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_record,
    make_trainee,
)


async def _course(db, institution_type: str):
    inst = TrainingInstitution(name=f"{institution_type}기관", institution_type=institution_type)
    db.add(inst)
    await db.flush()
    course = TrainingCourse(institution_id=inst.id, name=f"{institution_type}과정", total_hours=D(8))
    db.add(course)
    await db.flush()
    return inst, course


class TestSessionSourceFollowsInstitution:
    async def test_create_ignores_requested_source_and_returns_institution_type(self, client, db):
        _, course = await _course(db, "internal")
        _, token = await make_admin(db)
        await db.commit()
        resp = await client.post(
            "/api/course-sessions",
            json={"course_id": str(course.id), "total_hours": 8, "source": "external"},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["source"] == "internal"
        assert resp.json()["institution_type"] == "internal"

    async def test_update_resyncs_source_to_institution(self, client, db):
        inst, course = await _course(db, "internal")
        _, token = await make_admin(db)
        await db.commit()
        created = await client.post(
            "/api/course-sessions",
            json={"course_id": str(course.id), "total_hours": 8},
            cookies=admin_cookie(token),
        )
        sid = created.json()["id"]
        # 기관이 외부로 바뀐 뒤 수정하면 일정 구분도 외부로 맞춰진다 — 보낸 값(internal)은 무시
        inst.institution_type = "external"
        await db.commit()
        resp = await client.patch(
            f"/api/course-sessions/{sid}",
            json={"source": "internal", "memo": "x"},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["source"] == "external"
        assert resp.json()["institution_type"] == "external"


class TestSessionCourseChange:
    async def _create(self, client, token, course_id):
        resp = await client.post(
            "/api/course-sessions",
            json={"course_id": str(course_id), "total_hours": 8},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 201, resp.text
        return resp.json()["id"]

    async def test_change_course_to_other_institution_resyncs_source(self, client, db):
        _, internal_course = await _course(db, "internal")
        _, external_course = await _course(db, "external")
        _, token = await make_admin(db)
        await db.commit()
        sid = await self._create(client, token, internal_course.id)
        resp = await client.patch(
            f"/api/course-sessions/{sid}",
            json={"course_id": str(external_course.id), "source": "internal"},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["course_id"] == str(external_course.id)
        assert body["source"] == "external"
        assert body["institution_type"] == "external"

    async def test_change_course_blocked_when_trainees_linked(self, client, db):
        _, internal_course = await _course(db, "internal")
        _, external_course = await _course(db, "external")
        grade = await make_grade(db, code="g-cc", name="과정변경")
        _, trainee = await make_trainee(db, grade.id, ci_raw=None, trainee_no="CC-1")
        _, token = await make_admin(db)
        await db.commit()
        sid = await self._create(client, token, internal_course.id)
        record = await make_record(db, trainee.id, record_no="CC-REC-1")
        record.session_id = uuid.UUID(sid)
        await db.commit()
        resp = await client.patch(
            f"/api/course-sessions/{sid}",
            json={"course_id": str(external_course.id)},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 422
