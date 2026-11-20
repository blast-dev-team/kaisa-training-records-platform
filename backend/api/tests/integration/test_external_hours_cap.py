"""통합 — 외부계속교육 등록 한도: 감리원별 최근 3년 외부교육 합계 16시간 초과 등록 차단.

외부교육 = 교육기관 구분이 사내(internal)가 아닌 교육(외부·미선택·기관 미연결).
차단 기준 = 변경으로 합계가 늘었고, 늘어난 합계가 16시간을 넘을 때.
"""

import io
import uuid
from datetime import timedelta
from decimal import Decimal

import openpyxl
from sqlalchemy import func, select

from app.core.kst import today_kst
from app.domain.institution.model import TrainingCourse, TrainingInstitution
from app.domain.training_record.model import TrainingRecord
from tests.integration.helpers import admin_cookie, make_admin, make_trainee

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
RECENT = today_kst() - timedelta(days=30)
OLD = today_kst() - timedelta(days=3 * 365 + 30)  # 3년 창 밖


async def _institution(db, name: str, institution_type: str | None) -> TrainingInstitution:
    inst = TrainingInstitution(name=name, institution_type=institution_type)
    db.add(inst)
    await db.flush()
    return inst


async def _record(
    db,
    trainee_id,
    hours,
    *,
    institution=None,
    started_at=RECENT,
    status="completed",
    deleted=False,
    no=None,
) -> TrainingRecord:
    record = TrainingRecord(
        training_record_no=no or f"TRN-EXT-{uuid.uuid4().hex[:8]}",
        trainee_id=trainee_id,
        institution_id=institution.id if institution else None,
        course_name=f"외부과정-{uuid.uuid4().hex[:4]}",
        institution_name=institution.name if institution else "미연결기관",
        total_hours=Decimal(hours),
        completed_hours=Decimal(hours),
        started_at=started_at,
        ended_at=started_at,
        completion_status=status,
        deleted_at=today_kst() if deleted else None,
    )
    db.add(record)
    await db.flush()
    return record


async def _setup(db, name="김외부", trainee_no="TR-EXT-1"):
    _, trainee = await make_trainee(db, None, ci_raw=None, name=name, trainee_no=trainee_no)
    external = await _institution(db, f"외부기관-{trainee_no}", "external")
    internal = await _institution(db, f"감리협회-{trainee_no}", "internal")
    _, token = await make_admin(db, email=f"{trainee_no.lower()}@example.com")
    return trainee, external, internal, admin_cookie(token)


async def _create(client, cookie, trainee, institution, hours, started_at=RECENT, **extra):
    return await client.post(
        "/api/training-records",
        json={
            "trainee_id": str(trainee.id),
            "institution_id": str(institution.id),
            "course_name": f"신규과정-{uuid.uuid4().hex[:6]}",
            "total_hours": str(hours),
            "started_at": started_at.isoformat(),
            "ended_at": started_at.isoformat(),
            **extra,
        },
        cookies=cookie,
    )


async def _count(db, trainee_id) -> int:
    return (
        await db.execute(
            select(func.count())
            .select_from(TrainingRecord)
            .where(TrainingRecord.trainee_id == trainee_id, TrainingRecord.deleted_at.is_(None))
        )
    ).scalar_one()


class TestCreate:
    async def test_exactly_16_hours_is_allowed(self, client, db):
        trainee, external, _, cookie = await _setup(db)
        await _record(db, trainee.id, 15, institution=external)
        await db.commit()

        resp = await _create(client, cookie, trainee, external, 1)
        assert resp.status_code == 201, resp.text

    async def test_over_16_is_blocked_with_current_hours_in_message(self, client, db):
        trainee, external, _, cookie = await _setup(db)
        await _record(db, trainee.id, 15, institution=external)
        await db.commit()

        resp = await _create(client, cookie, trainee, external, 2)
        assert resp.status_code == 422
        detail = resp.json()
        assert detail["code"] == "EXTERNAL_HOURS_EXCEEDED"
        assert "15시간" in detail["message"]
        assert "남은 한도 1시간" in detail["message"]
        assert await _count(db, trainee.id) == 1  # 저장되지 않음

    async def test_half_hour_over_is_blocked(self, client, db):
        trainee, external, _, cookie = await _setup(db)
        await _record(db, trainee.id, 16, institution=external)
        await db.commit()

        resp = await _create(client, cookie, trainee, external, "0.5")
        assert resp.status_code == 422
        assert "16시간" in resp.json()["message"]

    async def test_internal_education_is_never_blocked(self, client, db):
        trainee, external, internal, cookie = await _setup(db)
        await _record(db, trainee.id, 20, institution=external)
        await db.commit()

        resp = await _create(client, cookie, trainee, internal, 8)
        assert resp.status_code == 201, resp.text

    async def test_unselected_institution_type_counts_as_external(self, client, db):
        trainee, _, _, cookie = await _setup(db)
        unselected = await _institution(db, "구분미선택기관", None)
        await _record(db, trainee.id, 10, institution=unselected)
        await _record(db, trainee.id, 6)  # 기관 미연결 레거시 이력도 외부
        await db.commit()

        resp = await _create(client, cookie, trainee, unselected, 1)
        assert resp.status_code == 422
        assert "16시간" in resp.json()["message"]

    async def test_records_outside_3_year_window_do_not_count(self, client, db):
        trainee, external, _, cookie = await _setup(db)
        await _record(db, trainee.id, 30, institution=external, started_at=OLD)
        await db.commit()

        resp = await _create(client, cookie, trainee, external, 16)
        assert resp.status_code == 201, resp.text

    async def test_registering_an_old_record_outside_window_is_allowed(self, client, db):
        trainee, external, _, cookie = await _setup(db)
        await _record(db, trainee.id, 16, institution=external)
        await db.commit()

        resp = await _create(client, cookie, trainee, external, 8, started_at=OLD)
        assert resp.status_code == 201, resp.text

    async def test_canceled_and_deleted_records_do_not_count(self, client, db):
        trainee, external, _, cookie = await _setup(db)
        await _record(db, trainee.id, 10, institution=external, status="canceled")
        await _record(db, trainee.id, 10, institution=external, deleted=True)
        await db.commit()

        resp = await _create(client, cookie, trainee, external, 16)
        assert resp.status_code == 201, resp.text

    async def test_other_trainees_hours_do_not_count(self, client, db):
        trainee, external, _, cookie = await _setup(db)
        _, other = await make_trainee(db, None, ci_raw=None, name="박타인", trainee_no="TR-EXT-OTHER")
        await _record(db, other.id, 16, institution=external)
        await db.commit()

        resp = await _create(client, cookie, trainee, external, 16)
        assert resp.status_code == 201, resp.text


class TestUpdate:
    async def test_increasing_hours_over_cap_is_blocked(self, client, db):
        trainee, external, _, cookie = await _setup(db)
        await _record(db, trainee.id, 10, institution=external)
        target = await _record(db, trainee.id, 4, institution=external)
        await db.commit()

        resp = await client.patch(
            f"/api/training-records/{target.id}", json={"total_hours": "8"}, cookies=cookie
        )
        assert resp.status_code == 422
        await db.refresh(target)
        assert target.total_hours == Decimal(4)

    async def test_editing_own_record_up_to_cap_excludes_itself(self, client, db):
        trainee, external, _, cookie = await _setup(db)
        await _record(db, trainee.id, 4, institution=external)
        target = await _record(db, trainee.id, 10, institution=external)
        await db.commit()

        resp = await client.patch(
            f"/api/training-records/{target.id}", json={"total_hours": "12"}, cookies=cookie
        )
        assert resp.status_code == 200, resp.text

    async def test_legacy_over_cap_trainee_can_still_edit_without_increasing(self, client, db):
        """이미 16시간 넘게 등록된 기존 감리원 — 메모 수정·시간 축소는 허용."""
        trainee, external, _, cookie = await _setup(db)
        await _record(db, trainee.id, 12, institution=external)
        target = await _record(db, trainee.id, 10, institution=external)
        await db.commit()

        memo = await client.patch(
            f"/api/training-records/{target.id}", json={"memo": "확인 완료"}, cookies=cookie
        )
        assert memo.status_code == 200, memo.text
        shrink = await client.patch(
            f"/api/training-records/{target.id}", json={"total_hours": "8"}, cookies=cookie
        )
        assert shrink.status_code == 200, shrink.text
        grow = await client.patch(
            f"/api/training-records/{target.id}", json={"total_hours": "9"}, cookies=cookie
        )
        assert grow.status_code == 422

    async def test_moving_start_date_into_window_is_checked(self, client, db):
        trainee, external, _, cookie = await _setup(db)
        await _record(db, trainee.id, 12, institution=external)
        target = await _record(db, trainee.id, 8, institution=external, started_at=OLD)
        await db.commit()

        resp = await client.patch(
            f"/api/training-records/{target.id}",
            json={"started_at": RECENT.isoformat(), "ended_at": RECENT.isoformat()},
            cookies=cookie,
        )
        assert resp.status_code == 422


class TestBulkUpdate:
    async def test_rows_of_same_trainee_are_summed_and_all_rejected(self, client, db):
        trainee, external, _, cookie = await _setup(db)
        a = await _record(db, trainee.id, 6, institution=external)
        b = await _record(db, trainee.id, 6, institution=external)
        await db.commit()

        resp = await client.patch(
            "/api/training-records/bulk",
            json={"updates": [
                {"id": str(a.id), "total_hours": "9"},
                {"id": str(b.id), "total_hours": "9"},
            ]},
            cookies=cookie,
        )
        assert resp.status_code == 422
        assert "김외부" in resp.json()["message"]
        await db.refresh(a)
        await db.refresh(b)
        assert (a.total_hours, b.total_hours) == (Decimal(6), Decimal(6))

    async def test_changing_course_to_external_institution_is_checked(self, client, db):
        trainee, external, internal, cookie = await _setup(db)
        await _record(db, trainee.id, 12, institution=external)
        target = await _record(db, trainee.id, 8, institution=internal)
        ext_course = TrainingCourse(institution_id=external.id, name="외부과정X")
        db.add(ext_course)
        await db.commit()

        resp = await client.patch(
            "/api/training-records/bulk",
            json={"updates": [{"id": str(target.id), "course_id": str(ext_course.id)}]},
            cookies=cookie,
        )
        assert resp.status_code == 422


class TestSessionAttach:
    async def test_over_cap_trainee_is_excluded_others_are_linked(self, client, db):
        trainee, external, _, cookie = await _setup(db)
        _, fresh = await make_trainee(db, None, ci_raw=None, name="이신규", trainee_no="TR-EXT-NEW")
        await _record(db, trainee.id, 10, institution=external)
        course = TrainingCourse(institution_id=external.id, name="외부 일정 과정")
        db.add(course)
        await db.commit()

        session = await client.post(
            "/api/course-sessions",
            json={
                "course_id": str(course.id),
                "started_at": RECENT.isoformat(),
                "ended_at": RECENT.isoformat(),
                "total_hours": "8",
            },
            cookies=cookie,
        )
        assert session.status_code == 201, session.text

        resp = await client.post(
            "/api/training-records/bulk",
            json={"session_id": session.json()["id"], "trainee_ids": [str(trainee.id), str(fresh.id)]},
            cookies=cookie,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"created": 1, "skipped": 0, "external_cap_excluded": ["김외부"]}
        assert await _count(db, trainee.id) == 1
        assert await _count(db, fresh.id) == 1

    async def test_internal_session_is_not_checked(self, client, db):
        trainee, external, internal, cookie = await _setup(db)
        await _record(db, trainee.id, 20, institution=external)
        course = TrainingCourse(institution_id=internal.id, name="협회 일정 과정")
        db.add(course)
        await db.commit()

        session = await client.post(
            "/api/course-sessions",
            json={"course_id": str(course.id), "started_at": RECENT.isoformat(), "total_hours": "8"},
            cookies=cookie,
        )
        resp = await client.post(
            "/api/training-records/bulk",
            json={"session_id": session.json()["id"], "trainee_ids": [str(trainee.id)]},
            cookies=cookie,
        )
        assert resp.json()["created"] == 1


def _xlsx(rows: list[list]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["교육생명", "감리원증번호", "교육기관명", "과목명", "시작일자", "종료일자", "교육시간", "인정시간"])
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class TestImport:
    async def test_preview_marks_rows_cumulatively(self, client, db):
        trainee, external, internal, cookie = await _setup(db, name="정엑셀", trainee_no="TR-EXT-XL")
        await _record(db, trainee.id, 10, institution=external)
        await db.commit()
        day = RECENT.strftime("%Y.%m.%d")

        resp = await client.post(
            "/api/training-records/import-preview",
            files={"file": ("r.xlsx", _xlsx([
                ["정엑셀", None, external.name, "외부A", day, day, 4, 4],       # 14 → 통과
                ["정엑셀", None, external.name, "외부B", day, day, 4, 4],       # 18 → 초과
                ["정엑셀", None, internal.name, "협회C", day, day, 8, 8],       # 사내 → 통과
                ["정엑셀", None, "처음보는외부기관", "외부D", day, day, 2, 2],  # 신규 기관=외부, 16 → 통과
            ]), XLSX_MIME)},
            cookies=cookie,
        )
        assert resp.status_code == 200, resp.text
        errors = [row["errors"] for row in resp.json()["rows"]]
        assert errors[0] == []
        assert len(errors[1]) == 1 and "14시간" in errors[1][0]
        assert errors[2] == []
        assert errors[3] == []

    async def test_confirm_skips_over_cap_rows_with_reason(self, client, db):
        trainee, external, _, cookie = await _setup(db, name="최확정", trainee_no="TR-EXT-CF")
        await _record(db, trainee.id, 12, institution=external)
        await db.commit()
        day = RECENT.strftime("%Y.%m.%d")
        base = {"cert_no": None, "institution": external.name, "start_date": day, "end_date": day,
                "trainee_id": str(trainee.id), "name": "최확정"}

        resp = await client.post(
            "/api/training-records/import-confirm",
            json={"rows": [
                {**base, "row_number": 2, "subject": "외부1", "hours_total": "4", "hours_recog": "4"},
                {**base, "row_number": 3, "subject": "외부2", "hours_total": "1", "hours_recog": "1"},
            ]},
            cookies=cookie,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["created"] == 1
        assert len(body["failed"]) == 1
        assert body["failed"][0]["row_number"] == 3
        assert "16시간" in body["failed"][0]["error"]


class TestSummaryApi:
    async def test_returns_window_total_and_remaining(self, client, db):
        trainee, external, internal, cookie = await _setup(db)
        target = await _record(db, trainee.id, 10, institution=external)
        await _record(db, trainee.id, "3.5", institution=external)
        await _record(db, trainee.id, 8, institution=internal)
        await _record(db, trainee.id, 9, institution=external, started_at=OLD)
        await db.commit()

        resp = await client.get(
            "/api/training-records/external-hours",
            params={"trainee_id": str(trainee.id)},
            cookies=cookie,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["external_hours"] == 13.5
        assert body["max_hours"] == 16
        assert body["remaining_hours"] == 2.5

        excluded = await client.get(
            "/api/training-records/external-hours",
            params={"trainee_id": str(trainee.id), "exclude_record_id": str(target.id)},
            cookies=cookie,
        )
        assert excluded.json()["external_hours"] == 3.5

    async def test_requires_admin(self, client, db):
        trainee, _, _, _ = await _setup(db)
        await db.commit()
        resp = await client.get(
            "/api/training-records/external-hours", params={"trainee_id": str(trainee.id)}
        )
        assert resp.status_code == 401
