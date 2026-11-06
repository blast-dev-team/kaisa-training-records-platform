"""통합 — 과정 마스터: 과정명 수정 시 연결 교육내역 과정명 동기화 · 등록일/수정일 정렬."""

from datetime import datetime

from app.core.kst import KST
from app.domain.institution.model import TrainingCourse, TrainingInstitution
from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_record,
    make_trainee,
)


async def _admin(db):
    _, token = await make_admin(db)
    return admin_cookie(token)


async def _course(db, name: str = "구 과정명", **kw) -> TrainingCourse:
    inst = kw.pop("institution", None)
    if inst is None:
        inst = TrainingInstitution(name=f"기관-{name}")
        db.add(inst)
        await db.flush()
    course = TrainingCourse(institution_id=inst.id, name=name, **kw)
    db.add(course)
    await db.flush()
    return course


class TestCourseRenameSyncsRecords:
    async def test_rename_updates_linked_record_course_name(self, client, db):
        grade = await make_grade(db, code="g-cm", name="과정등급")
        _, trainee = await make_trainee(db, grade.id, ci_raw="ci-cm", trainee_no="TR-CM")
        course = await _course(db, "구 과정명")
        linked = await make_record(db, trainee.id, record_no="TRN-CM-1")
        linked.course_id = course.id
        linked.course_name = course.name
        other = await make_record(db, trainee.id, record_no="TRN-CM-2")  # 미연결
        await db.commit()
        cookie = await _admin(db)

        resp = await client.patch(
            f"/api/courses/{course.id}", json={"name": "새 과정명"}, cookies=cookie
        )
        assert resp.status_code == 200, resp.text

        await db.refresh(linked)
        await db.refresh(other)
        assert linked.course_name == "새 과정명"
        assert other.course_name == "안전보건교육"

    async def test_non_name_update_keeps_record_course_name(self, client, db):
        grade = await make_grade(db, code="g-cm2", name="과정등급2")
        _, trainee = await make_trainee(db, grade.id, ci_raw="ci-cm2", trainee_no="TR-CM2")
        course = await _course(db, "그대로 과정")
        rec = await make_record(db, trainee.id, record_no="TRN-CM-3")
        rec.course_id = course.id
        rec.course_name = "이관 당시 스냅샷"
        await db.commit()
        cookie = await _admin(db)

        resp = await client.patch(
            f"/api/courses/{course.id}", json={"total_hours": "8"}, cookies=cookie
        )
        assert resp.status_code == 200, resp.text
        await db.refresh(rec)
        assert rec.course_name == "이관 당시 스냅샷"


class TestCourseListSort:
    async def _seed(self, db):
        inst = TrainingInstitution(name="정렬기관")
        db.add(inst)
        await db.flush()
        a = await _course(db, "가 과정", institution=inst)
        b = await _course(db, "나 과정", institution=inst)
        a.created_at = datetime(2026, 1, 1, tzinfo=KST)
        a.updated_at = datetime(2026, 10, 1, tzinfo=KST)
        b.created_at = datetime(2026, 5, 1, tzinfo=KST)
        b.updated_at = datetime(2026, 6, 1, tzinfo=KST)
        await db.commit()

    @staticmethod
    def _names(resp) -> list[str]:
        assert resp.status_code == 200, resp.text
        return [i["name"] for i in resp.json()["items"]]

    async def test_default_is_name_asc(self, client, db):
        await self._seed(db)
        cookie = await _admin(db)
        resp = await client.get("/api/courses", cookies=cookie)
        assert self._names(resp) == ["가 과정", "나 과정"]

    async def test_created_at_desc(self, client, db):
        await self._seed(db)
        cookie = await _admin(db)
        resp = await client.get(
            "/api/courses", params={"sort": "created_at", "order": "desc"}, cookies=cookie
        )
        assert self._names(resp) == ["나 과정", "가 과정"]

    async def test_updated_at_desc_and_exposed(self, client, db):
        await self._seed(db)
        cookie = await _admin(db)
        resp = await client.get(
            "/api/courses", params={"sort": "updated_at", "order": "desc"}, cookies=cookie
        )
        assert self._names(resp) == ["가 과정", "나 과정"]
        assert "updated_at" in resp.json()["items"][0]
