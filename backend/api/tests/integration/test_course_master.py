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


class TestCourseExternalFlagDerivation:
    """사내/외부 플래그는 소속 기관 구분을 따른다 — 요청 값은 무시."""

    async def test_create_on_internal_institution_ignores_external_flag(self, client, db):
        _actor, token = await make_admin(db)
        inst = TrainingInstitution(name="사내기관-플래그", institution_type="internal")
        db.add(inst)
        await db.commit()

        resp = await client.post(
            "/api/courses",
            json={"institution_id": str(inst.id), "name": "사내 과정", "is_external": True},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["is_external"] is False

    async def test_create_on_external_institution_sets_external(self, client, db):
        _actor, token = await make_admin(db)
        inst = TrainingInstitution(name="외부기관-플래그", institution_type="external")
        db.add(inst)
        await db.commit()

        resp = await client.post(
            "/api/courses",
            json={"institution_id": str(inst.id), "name": "외부 과정", "is_external": False},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["is_external"] is True

    async def test_update_cannot_flip_flag_against_institution(self, client, db):
        _actor, token = await make_admin(db)
        inst = TrainingInstitution(name="사내기관-수정", institution_type="internal")
        db.add(inst)
        await db.flush()
        course = TrainingCourse(institution_id=inst.id, name="플래그 과정")
        db.add(course)
        await db.commit()

        resp = await client.patch(
            f"/api/courses/{course.id}",
            json={"is_external": True},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["is_external"] is False


class TestInstitutionTypeChangeCascades:
    """기관 유형 변경 → 그 기관 교육내역 소스·과정 플래그 연동."""

    async def test_type_change_updates_records_and_courses(self, client, db):
        from app.domain.training_record.model import TrainingRecord

        grade = await make_grade(db, code="g-casc", name="연동등급")
        _, trainee = await make_trainee(db, grade.id, ci_raw="ci-casc", trainee_no="TR-CASC")
        inst = TrainingInstitution(name="연동기관", institution_type="internal")
        db.add(inst)
        await db.flush()
        course = TrainingCourse(institution_id=inst.id, name="연동 과정", is_external=False)
        db.add(course)
        rec_internal = TrainingRecord(
            training_record_no="TRN-CASC-1",
            trainee_id=trainee.id,
            institution_id=inst.id,
            course_id=course.id,
            course_name="연동 과정",
            institution_name=inst.name,
            total_hours=8,
            completed_hours=8,
            source="internal",
        )
        rec_external = TrainingRecord(
            training_record_no="TRN-CASC-2",
            trainee_id=trainee.id,
            institution_id=inst.id,
            course_id=course.id,
            course_name="연동 과정",
            institution_name=inst.name,
            total_hours=4,
            completed_hours=4,
            source="external",
        )
        db.add_all([rec_internal, rec_external])
        await db.commit()
        cookie = await _admin(db)

        resp = await client.patch(
            f"/api/institutions/{inst.id}",
            json={"institution_type": "external"},
            cookies=cookie,
        )
        assert resp.status_code == 200, resp.text

        await db.refresh(rec_internal)
        await db.refresh(rec_external)
        await db.refresh(course)
        assert rec_internal.source == "external"
        assert rec_external.source == "external"
        assert course.is_external is True

    async def test_no_type_change_leaves_records(self, client, db):
        from app.domain.training_record.model import TrainingRecord

        grade = await make_grade(db, code="g-casc2", name="연동등급2")
        _, trainee = await make_trainee(db, grade.id, ci_raw="ci-casc2", trainee_no="TR-CASC2")
        inst = TrainingInstitution(name="연동기관2", institution_type="internal")
        db.add(inst)
        await db.flush()
        rec = TrainingRecord(
            training_record_no="TRN-CASC-3",
            trainee_id=trainee.id,
            institution_id=inst.id,
            course_name="연동 과정2",
            institution_name=inst.name,
            total_hours=2,
            completed_hours=2,
            source="external",
        )
        db.add(rec)
        await db.commit()
        cookie = await _admin(db)

        resp = await client.patch(
            f"/api/institutions/{inst.id}",
            json={"name": "이름만 변경"},
            cookies=cookie,
        )
        assert resp.status_code == 200, resp.text
        await db.refresh(rec)
        assert rec.source == "external"
