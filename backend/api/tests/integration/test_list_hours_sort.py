"""통합 — 감리원 목록 사내/외부 교육 시간 + 교육시간 정렬, 교육일정 인정시수·수강생 정렬."""

from datetime import date
from decimal import Decimal as D

from app.domain.institution.model.course_session import CourseSession
from app.domain.institution.model.training_course import TrainingCourse
from app.domain.institution.model.training_institution import TrainingInstitution
from tests.integration.helpers import admin_cookie, make_admin, make_grade, make_record, make_trainee


async def _inst(db, name: str, institution_type: str | None):
    inst = TrainingInstitution(name=name, institution_type=institution_type)
    db.add(inst)
    await db.flush()
    return inst


async def _rec(db, trainee_id, no: str, hours: str, inst=None, status: str = "completed"):
    r = await make_record(db, trainee_id, record_no=no, completion_status=status)
    r.total_hours = D(hours)
    r.institution_id = inst.id if inst else None
    return r


async def _seed(db):
    """A: 사내 8 + 외부 19 / B: 사내 30 / C: 이력 없음. 미연결·미설정·취소·삭제 처리 확인 포함."""
    grade = await make_grade(db, code="g-hours", name="시간등급")
    internal = await _inst(db, "협회 본부", "internal")
    external = await _inst(db, "외부기관", "external")
    unset = await _inst(db, "미설정기관", None)
    _, a = await make_trainee(db, grade.id, ci_raw=None, name="시간A", trainee_no="HR-A")
    _, b = await make_trainee(db, grade.id, ci_raw=None, name="시간B", trainee_no="HR-B")
    _, c = await make_trainee(db, grade.id, ci_raw=None, name="시간C", trainee_no="HR-C")
    await _rec(db, a.id, "HR-1", "8", internal)
    await _rec(db, a.id, "HR-2", "10", external)
    await _rec(db, a.id, "HR-3", "5", unset)  # 구분 미설정 → 외부
    await _rec(db, a.id, "HR-4", "4", None)  # 기관 미연결 → 외부
    await _rec(db, a.id, "HR-5", "100", external, status="canceled")  # 취소 제외
    deleted = await _rec(db, a.id, "HR-6", "100", internal)
    deleted.deleted_at = deleted.created_at  # 삭제 제외
    await _rec(db, b.id, "HR-7", "30", internal)
    return internal, external


async def _list(client, token, **params):
    resp = await client.get("/api/trainees", params=params, cookies=admin_cookie(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["items"]


class TestTraineeHours:
    async def test_internal_external_hours_per_row(self, client, db):
        await _seed(db)
        _, token = await make_admin(db)
        await db.commit()
        rows = {r["name"]: r for r in await _list(client, token)}
        assert D(rows["시간A"]["internal_hours"]) == D(8)
        assert D(rows["시간A"]["external_hours"]) == D(19)
        assert D(rows["시간B"]["internal_hours"]) == D(30)
        assert D(rows["시간B"]["external_hours"]) == D(0)
        assert D(rows["시간C"]["internal_hours"]) == D(0)

    async def test_hours_sorts(self, client, db):
        await _seed(db)
        _, token = await make_admin(db)
        await db.commit()

        async def names(sort, order):
            return [r["name"] for r in await _list(client, token, sort=sort, order=order)]

        assert await names("total_hours", "desc") == ["시간B", "시간A", "시간C"]
        assert await names("total_hours", "asc") == ["시간C", "시간A", "시간B"]
        assert (await names("external_hours", "desc"))[0] == "시간A"
        assert (await names("internal_hours", "desc"))[0] == "시간B"

    async def test_institution_type_change_reflects_immediately(self, client, db):
        """기관을 외부→사내로 바꾸면 저장된 source 와 상관없이 다음 조회부터 사내로 잡힌다."""
        _, external = await _seed(db)
        _, token = await make_admin(db)
        await db.commit()
        external.institution_type = "internal"
        await db.commit()
        rows = {r["name"]: r for r in await _list(client, token)}
        assert D(rows["시간A"]["internal_hours"]) == D(18)
        assert D(rows["시간A"]["external_hours"]) == D(9)

    async def test_invalid_sort_rejected(self, client, db):
        _, token = await make_admin(db)
        await db.commit()
        resp = await client.get(
            "/api/trainees",
            params={"sort": "hours", "order": "desc"},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 422


class TestSessionSorts:
    async def _seed_sessions(self, db):
        grade = await make_grade(db, code="g-sess", name="일정등급")
        inst = await _inst(db, "정렬기관", "internal")
        course = TrainingCourse(institution_id=inst.id, name="정렬과정", total_hours=D(8))
        db.add(course)
        await db.flush()
        sessions = {}
        # S1: 인정 4h·수강 3명 / S2: 인정 16h·수강 1명 / S3: 인정 8h·수강 0명
        for key, hours, day in (("S1", "4", 1), ("S2", "16", 2), ("S3", "8", 3)):
            s = CourseSession(
                course_id=course.id,
                started_at=date(2026, 9, day),
                total_hours=D(hours),
                recognized_hours=D(hours),
                memo=key,
            )
            db.add(s)
            sessions[key] = s
        await db.flush()
        _, t = await make_trainee(db, grade.id, ci_raw=None, name="수강생", trainee_no="HR-S")
        for i, key in enumerate(("S1", "S1", "S1", "S2")):
            r = await make_record(db, t.id, record_no=f"HR-S-{i}")
            r.session_id = sessions[key].id
        await db.flush()

    async def _memos(self, client, token, sort):
        resp = await client.get(
            "/api/course-sessions", params={"sort": sort}, cookies=admin_cookie(token)
        )
        assert resp.status_code == 200, resp.text
        return [s["memo"] for s in resp.json()["items"]]

    async def test_recognized_hours_sort(self, client, db):
        await self._seed_sessions(db)
        _, token = await make_admin(db)
        await db.commit()
        assert await self._memos(client, token, "recognized_hours_desc") == ["S2", "S3", "S1"]
        assert await self._memos(client, token, "recognized_hours_asc") == ["S1", "S3", "S2"]

    async def test_enrolled_sort(self, client, db):
        await self._seed_sessions(db)
        _, token = await make_admin(db)
        await db.commit()
        assert await self._memos(client, token, "enrolled_desc") == ["S1", "S2", "S3"]
        assert await self._memos(client, token, "enrolled_asc") == ["S3", "S2", "S1"]
