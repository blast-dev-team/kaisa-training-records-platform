"""통합 — 교육 일정: 등록·목록검색·교육생 일괄 연결(이력 생성)·삭제 시 이력 보존."""

import uuid
from decimal import Decimal

from sqlalchemy import select

from app.core.kst import today_kst
from app.domain.institution.model import (
    CourseSession,
    TrainingCourse,
    TrainingInstitution,
)
from app.domain.training_record.model import TrainingRecord
from tests.integration.helpers import admin_cookie, make_admin, make_trainee


async def make_course(db) -> TrainingCourse:
    institution = TrainingInstitution(name="테스트기관")
    db.add(institution)
    await db.flush()
    course = TrainingCourse(
        institution_id=institution.id, name="파이썬 데이터 분석", total_hours=Decimal(8)
    )
    db.add(course)
    await db.flush()
    return course


async def _two_trainees(db):
    _, t1 = await make_trainee(
        db, grade_id=None, ci_raw=None, trainee_no="TR-SESS-0001", name="김일"
    )
    _, t2 = await make_trainee(
        db, grade_id=None, ci_raw=None, trainee_no="TR-SESS-0002", name="김이"
    )
    return t1, t2


class TestCourseSessions:
    async def test_create_and_list_sessions(self, client, db):
        _actor, token = await make_admin(db)
        course = await make_course(db)
        await db.commit()

        resp = await client.post(
            "/api/course-sessions",
            json={
                "course_id": str(course.id),
                "started_at": "2026-09-01",
                "ended_at": "2026-09-02",
                "total_hours": "8",
                "recognized_hours": "8",
                "memo": "9월 정기 교육",
            },
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["course_name"] == "파이썬 데이터 분석"
        assert body["institution_name"] == "테스트기관"
        assert body["memo"] == "9월 정기 교육"

        # 과정명 검색으로 목록 조회 — 일정 선택기 경로
        resp = await client.get(
            "/api/course-sessions",
            params={"search": "파이썬"},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

        # 종료일 < 시작일 → 422 (VALIDATION_ERROR)
        resp = await client.post(
            "/api/course-sessions",
            json={
                "course_id": str(course.id),
                "started_at": "2026-09-10",
                "ended_at": "2026-09-01",
            },
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 422

    async def test_bulk_attach_creates_records_and_skips_dups(self, client, db):
        _actor, token = await make_admin(db)
        course = await make_course(db)
        t1, t2 = await _two_trainees(db)
        await db.commit()

        resp = await client.post(
            "/api/course-sessions",
            json={"course_id": str(course.id), "started_at": "2026-09-01",
                  "recognized_hours": "4"},
            cookies=admin_cookie(token),
        )
        session_id = resp.json()["id"]

        # 교육생 2명 일괄 연결 → 이력 2건 생성
        resp = await client.post(
            "/api/training-records/bulk",
            json={"session_id": session_id, "trainee_ids": [str(t1.id), str(t2.id)],
                  "memo": "일괄 연결"},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 200
        assert resp.json() == {"created": 2, "skipped": 0}

        records = list(
            (
                await db.execute(
                    select(TrainingRecord).where(
                        TrainingRecord.session_id == uuid.UUID(session_id)
                    )
                )
            ).scalars()
        )
        assert len(records) == 2
        record = records[0]
        assert record.course_id == course.id
        assert record.course_name == "파이썬 데이터 분석"
        assert record.completed_hours == Decimal("4.00")
        assert record.completion_status == "completed"
        assert record.memo == "일괄 연결"

        # 재연결 — 중복 건너뜀
        resp = await client.post(
            "/api/training-records/bulk",
            json={"session_id": session_id,
                  "trainee_ids": [str(t1.id), str(t2.id)]},
            cookies=admin_cookie(token),
        )
        assert resp.json() == {"created": 0, "skipped": 2}

        # 일정별 이력 조회 (역방향 — 일정 상세 수강생 목록)
        resp = await client.get(
            "/api/training-records",
            params={"session_id": session_id},
            cookies=admin_cookie(token),
        )
        assert resp.json()["total"] == 2

    async def test_future_session_still_creates_completed(self, client, db):
        """종료일이 미래여도 연결 시점에 수료 완료로 생성 — 이수시수는 일정 인정시수"""
        import uuid as _uuid
        from datetime import timedelta

        _actor, token = await make_admin(db)
        course = await make_course(db)
        t1, _ = await _two_trainees(db)
        await db.commit()

        future = (today_kst() + timedelta(days=7)).isoformat()
        resp = await client.post(
            "/api/course-sessions",
            json={"course_id": str(course.id), "started_at": future,
                  "recognized_hours": "6"},
            cookies=admin_cookie(token),
        )
        session_id = resp.json()["id"]
        resp = await client.post(
            "/api/training-records/bulk",
            json={"session_id": session_id, "trainee_ids": [str(t1.id)]},
            cookies=admin_cookie(token),
        )
        assert resp.json() == {"created": 1, "skipped": 0}

        record = (
            await db.execute(
                select(TrainingRecord).where(
                    TrainingRecord.session_id == _uuid.UUID(session_id)
                )
            )
        ).scalar_one()
        assert record.completion_status == "completed"
        assert record.completed_hours == Decimal("6.00")
        assert record.completed_at is not None

    async def test_delete_session_preserves_records(self, client, db):
        _actor, token = await make_admin(db)
        course = await make_course(db)
        t1, _ = await _two_trainees(db)
        await db.commit()

        resp = await client.post(
            "/api/course-sessions",
            json={"course_id": str(course.id), "started_at": "2026-09-01"},
            cookies=admin_cookie(token),
        )
        session_id = uuid.UUID(resp.json()["id"])
        await client.post(
            "/api/training-records/bulk",
            json={"session_id": str(session_id), "trainee_ids": [str(t1.id)]},
            cookies=admin_cookie(token),
        )

        resp = await client.delete(
            f"/api/course-sessions/{session_id}", cookies=admin_cookie(token)
        )
        assert resp.status_code == 204

        assert await db.get(CourseSession, session_id) is None
        records = list(
            (
                await db.execute(
                    select(TrainingRecord).where(
                        TrainingRecord.trainee_id == t1.id
                    )
                )
            ).scalars()
        )
        assert len(records) == 1  # 이력은 보존, 연결만 끊김
        assert records[0].session_id is None

    async def test_bulk_update_applies_each_row_values(self, client, db):
        _actor, token = await make_admin(db)
        course = await make_course(db)
        await db.commit()
        ids = []
        for started in ("2026-09-01", "2026-09-02"):
            resp = await client.post(
                "/api/course-sessions",
                json={
                    "course_id": str(course.id),
                    "started_at": started,
                    "ended_at": "2026-09-05",
                    "recognized_hours": "4",
                    "memo": "원래 메모",
                },
                cookies=admin_cookie(token),
            )
            assert resp.status_code == 201
            ids.append(resp.json()["id"])

        # 행별로 다른 값 — 각 항목에 담긴 필드만 적용된다
        resp = await client.patch(
            "/api/course-sessions/bulk",
            json={
                "items": [
                    {"id": ids[0], "started_at": "2026-09-03", "recognized_hours": "8"},
                    {"id": ids[1], "is_active": False},
                ]
            },
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 200
        assert resp.json()["updated"] == 2

        resp = await client.get(
            "/api/course-sessions", params={"search": "파이썬"}, cookies=admin_cookie(token)
        )
        rows = {r["id"]: r for r in resp.json()["items"]}
        assert rows[ids[0]]["started_at"] == "2026-09-03"
        assert Decimal(rows[ids[0]]["recognized_hours"]) == Decimal(8)
        assert rows[ids[0]]["ended_at"] == "2026-09-05"  # 미포함 필드는 변경 없음
        assert rows[ids[0]]["is_active"] is True
        assert rows[ids[1]]["is_active"] is False
        assert rows[ids[1]]["started_at"] == "2026-09-02"
        assert Decimal(rows[ids[1]]["recognized_hours"]) == Decimal(4)

    async def test_bulk_update_rejects_bad_period(self, client, db):
        _actor, token = await make_admin(db)
        course = await make_course(db)
        await db.commit()
        resp = await client.post(
            "/api/course-sessions",
            json={"course_id": str(course.id), "started_at": "2026-09-01"},
            cookies=admin_cookie(token),
        )
        session_id = resp.json()["id"]

        resp = await client.patch(
            "/api/course-sessions/bulk",
            json={"items": [{"id": session_id, "ended_at": "2026-08-31"}]},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "VALIDATION_ERROR"

    async def test_bulk_delete_records(self, client, db):
        """선택 이력 일괄 삭제 — 소프트딜리트라 row 는 남고 deleted_at 만 찍힌다"""
        _actor, token = await make_admin(db)
        course = await make_course(db)
        t1, t2 = await _two_trainees(db)
        await db.commit()

        resp = await client.post(
            "/api/course-sessions",
            json={"course_id": str(course.id), "started_at": "2026-09-01"},
            cookies=admin_cookie(token),
        )
        session_id = resp.json()["id"]
        resp = await client.post(
            "/api/training-records/bulk",
            json={"session_id": session_id, "trainee_ids": [str(t1.id), str(t2.id)]},
            cookies=admin_cookie(token),
        )
        assert resp.json() == {"created": 2, "skipped": 0}

        record_ids = [
            str(r.id)
            for r in (
                await db.execute(
                    select(TrainingRecord).where(
                        TrainingRecord.session_id == uuid.UUID(session_id)
                    )
                )
            ).scalars()
        ]

        resp = await client.request(
            "DELETE",
            "/api/training-records/bulk",
            json={"ids": record_ids},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 2

        # 소프트딜리트 — row 는 보존되고 deleted_at 만 기록
        rows = list(
            (
                await db.execute(
                    select(TrainingRecord).where(
                        TrainingRecord.session_id == uuid.UUID(session_id)
                    )
                )
            ).scalars()
        )
        assert len(rows) == 2
        assert all(r.deleted_at is not None for r in rows)

    async def test_bulk_delete_preserves_records(self, client, db):
        _actor, token = await make_admin(db)
        course = await make_course(db)
        t1, t2 = await _two_trainees(db)
        await db.commit()
        ids = []
        for trainee in (t1, t2):
            resp = await client.post(
                "/api/course-sessions",
                json={"course_id": str(course.id), "started_at": "2026-09-01"},
                cookies=admin_cookie(token),
            )
            session_id = resp.json()["id"]
            ids.append(session_id)
            await client.post(
                "/api/training-records/bulk",
                json={"session_id": session_id, "trainee_ids": [str(trainee.id)]},
                cookies=admin_cookie(token),
            )

        resp = await client.request(
            "DELETE",
            "/api/course-sessions/bulk",
            json={"ids": ids},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 2

        records = list(
            (
                await db.execute(select(TrainingRecord).order_by(TrainingRecord.trainee_id))
            ).scalars()
        )
        assert len(records) == 2  # 이력은 보존, 연결만 끊김
        assert all(r.session_id is None for r in records)

    async def test_bulk_delete_unknown_id_rejected(self, client, db):
        _actor, token = await make_admin(db)
        course = await make_course(db)
        await db.commit()
        resp = await client.post(
            "/api/course-sessions",
            json={"course_id": str(course.id)},
            cookies=admin_cookie(token),
        )
        session_id = resp.json()["id"]

        resp = await client.request(
            "DELETE",
            "/api/course-sessions/bulk",
            json={"ids": [session_id, str(uuid.uuid4())]},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 404
        assert resp.json()["code"] == "NOT_FOUND"
        # 부분 처리 없음 — 존재 확인 후 한 번에 삭제
        assert await db.get(CourseSession, uuid.UUID(session_id)) is not None
