"""통합 — 교육 내역 일괄 수정에서 기관·과정 변경.

과정을 바꾸면 기관은 그 과정의 기관을 따르고, 표시용 스냅샷(과정명·기관명)도 함께 바뀐다.
감사 로그에는 변경 전·후 기관명·과정명이 남는다.
"""

import uuid
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.kst import today_kst
from app.domain.audit.model import AuditLog
from app.domain.institution.model import TrainingCourse, TrainingInstitution
from app.domain.training_record.model import TrainingRecord
from tests.integration.helpers import admin_cookie, make_admin, make_trainee

RECENT = today_kst() - timedelta(days=30)


async def _setup(db):
    _, trainee = await make_trainee(db, None, ci_raw=None, name="박수정", trainee_no="TR-BULK-1")
    old_inst = TrainingInstitution(name="(사)정보시스템감리협회", institution_type="internal")
    new_inst = TrainingInstitution(name="한국정보통신기술협회", institution_type="internal")
    db.add_all([old_inst, new_inst])
    await db.flush()
    old_course = TrainingCourse(institution_id=old_inst.id, name="감리 실무 기본")
    new_course = TrainingCourse(institution_id=new_inst.id, name="정보보호 심화")
    db.add_all([old_course, new_course])
    await db.flush()
    record = TrainingRecord(
        training_record_no=f"TRN-BULK-{uuid.uuid4().hex[:6]}",
        trainee_id=trainee.id,
        institution_id=old_inst.id,
        course_id=old_course.id,
        course_name=old_course.name,
        institution_name=old_inst.name,
        total_hours=Decimal(8),
        completed_hours=Decimal(8),
        started_at=RECENT,
        ended_at=RECENT,
        completion_status="completed",
    )
    db.add(record)
    _, token = await make_admin(db, email="bulk-course@example.com")
    await db.commit()
    return record, old_inst, new_inst, old_course, new_course, admin_cookie(token)


async def _patch(client, cookie, updates):
    return await client.patch(
        "/api/training-records/bulk", json={"updates": updates}, cookies=cookie
    )


async def _last_audit(db, record_id) -> AuditLog:
    return (
        await db.execute(
            select(AuditLog)
            .where(AuditLog.entity_id == record_id, AuditLog.action == "training_record.updated")
            .order_by(AuditLog.created_at.desc())
            .limit(1)
        )
    ).scalar_one()


class TestChangeInstitutionAndCourse:
    async def test_course_of_other_institution_moves_record(self, client, db):
        record, _, new_inst, _, new_course, cookie = await _setup(db)
        resp = await _patch(client, cookie, [{"id": str(record.id), "course_id": str(new_course.id)}])
        assert resp.status_code == 200, resp.json()

        await db.refresh(record)
        assert record.course_id == new_course.id
        assert record.institution_id == new_inst.id

    async def test_display_values_follow_new_course(self, client, db):
        """교육 내역 목록·WEB 교육이력·확인서가 쓰는 스냅샷이 바뀐다."""
        record, *_, new_course, cookie = await _setup(db)
        await _patch(client, cookie, [{"id": str(record.id), "course_id": str(new_course.id)}])

        item = (
            await client.get(
                "/api/training-records", params={"trainee_id": str(record.trainee_id)}, cookies=cookie
            )
        ).json()["items"][0]
        assert item["course_name"] == "정보보호 심화"
        assert item["institution_name"] == "한국정보통신기술협회"

    async def test_audit_keeps_before_and_after_names(self, client, db):
        record, *_, new_course, cookie = await _setup(db)
        await _patch(client, cookie, [{"id": str(record.id), "course_id": str(new_course.id)}])

        log = await _last_audit(db, record.id)
        assert log.before_data["institution_name"] == "(사)정보시스템감리협회"
        assert log.before_data["course_name"] == "감리 실무 기본"
        assert log.after_data["institution_name"] == "한국정보통신기술협회"
        assert log.after_data["course_name"] == "정보보호 심화"

    async def test_same_course_records_no_name_change(self, client, db):
        """과정을 그대로 두고 다른 값만 바꾸면 감사 로그에 기관·과정이 끼지 않는다."""
        record, *_, cookie = await _setup(db)
        await _patch(client, cookie, [{"id": str(record.id), "total_hours": "10"}])

        log = await _last_audit(db, record.id)
        assert "course_name" not in log.after_data
        assert log.before_data == {"total_hours": "8.00", "completed_hours": "8.00"}

    async def test_unknown_course_404_and_nothing_changes(self, client, db):
        record, *_, cookie = await _setup(db)
        resp = await _patch(client, cookie, [{"id": str(record.id), "course_id": str(uuid.uuid4())}])
        assert resp.status_code == 404
        await db.refresh(record)
        assert record.course_name == "감리 실무 기본"
