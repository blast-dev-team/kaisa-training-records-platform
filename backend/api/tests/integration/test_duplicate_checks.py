"""통합 — 교육내역·감리원 중복 등록 방지.

교육내역 중복 기준: 같은 교육생 + 과정명 + 시작일 (수동 등록·엑셀·일정 연결 공통)
감리원 중복 기준: 감리원증번호 일치 = 차단 / 이름+생년월일 일치 = 확인 후 허용
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import func, select

from app.domain.training_record.model import TrainingRecord
from tests.integration.helpers import admin_cookie, make_admin, make_trainee
from tests.integration.test_course_sessions import make_course
from tests.integration.test_training_record_import import make_xlsx, preview


def _record_payload(trainee_id, **overrides) -> dict:
    payload = {
        "trainee_id": str(trainee_id),
        "course_name": "파이썬 데이터 분석",
        "institution_name": "테스트기관",
        "total_hours": "8",
        "started_at": "2026-09-01",
        "ended_at": "2026-09-02",
        "source": "external",
    }
    payload.update(overrides)
    return payload


async def _count_records(db, trainee_id) -> int:
    return (
        await db.execute(
            select(func.count()).where(
                TrainingRecord.trainee_id == trainee_id,
                TrainingRecord.deleted_at.is_(None),
            )
        )
    ).scalar_one()


class TestManualRecordDuplicate:
    async def test_same_course_and_start_date_is_rejected_with_existing_info(self, client, db):
        _, token = await make_admin(db)
        _, trainee = await make_trainee(db, None, ci_raw=None, trainee_no="TR-DUP-1")
        await db.commit()

        first = await client.post(
            "/api/training-records", json=_record_payload(trainee.id), cookies=admin_cookie(token)
        )
        assert first.status_code == 201, first.text

        second = await client.post(
            "/api/training-records", json=_record_payload(trainee.id), cookies=admin_cookie(token)
        )
        assert second.status_code == 409
        assert second.json()["code"] == "DUPLICATE_TRAINING_RECORD"
        assert "파이썬 데이터 분석" in second.json()["message"]
        assert "2026-09-01" in second.json()["message"]

    async def test_allow_duplicate_creates_after_confirmation(self, client, db):
        _, token = await make_admin(db)
        _, trainee = await make_trainee(db, None, ci_raw=None, trainee_no="TR-DUP-2")
        await db.commit()

        await client.post(
            "/api/training-records", json=_record_payload(trainee.id), cookies=admin_cookie(token)
        )
        forced = await client.post(
            "/api/training-records",
            json=_record_payload(trainee.id, allow_duplicate=True),
            cookies=admin_cookie(token),
        )
        assert forced.status_code == 201
        assert await _count_records(db, trainee.id) == 2

    async def test_different_start_date_is_not_duplicate(self, client, db):
        _, token = await make_admin(db)
        _, trainee = await make_trainee(db, None, ci_raw=None, trainee_no="TR-DUP-3")
        await db.commit()

        await client.post(
            "/api/training-records", json=_record_payload(trainee.id), cookies=admin_cookie(token)
        )
        other = await client.post(
            "/api/training-records",
            json=_record_payload(trainee.id, started_at="2026-10-01", ended_at="2026-10-02"),
            cookies=admin_cookie(token),
        )
        assert other.status_code == 201

    async def test_deleted_record_does_not_block(self, client, db):
        _, token = await make_admin(db)
        _, trainee = await make_trainee(db, None, ci_raw=None, trainee_no="TR-DUP-4")
        await db.commit()

        first = await client.post(
            "/api/training-records", json=_record_payload(trainee.id), cookies=admin_cookie(token)
        )
        await client.delete(
            f"/api/training-records/{first.json()['id']}", cookies=admin_cookie(token)
        )
        again = await client.post(
            "/api/training-records", json=_record_payload(trainee.id), cookies=admin_cookie(token)
        )
        assert again.status_code == 201


class TestSessionAttachDuplicate:
    async def test_attach_skips_trainee_with_same_course_and_start_date(self, client, db):
        """일정과 무관하게 수동 등록된 같은 교육도 중복으로 보고 건너뛴다."""
        _, token = await make_admin(db)
        course = await make_course(db)
        _, t1 = await make_trainee(db, None, ci_raw=None, trainee_no="TR-DUP-S1", name="김일")
        _, t2 = await make_trainee(db, None, ci_raw=None, trainee_no="TR-DUP-S2", name="김이")
        db.add(
            TrainingRecord(
                training_record_no="REC-DUP-MANUAL",
                trainee_id=t1.id,
                course_name=course.name,
                institution_name="테스트기관",
                total_hours=Decimal(8),
                completed_hours=Decimal(8),
                started_at=date(2026, 9, 1),
            )
        )
        await db.commit()

        session = await client.post(
            "/api/course-sessions",
            json={"course_id": str(course.id), "started_at": "2026-09-01", "total_hours": "8"},
            cookies=admin_cookie(token),
        )
        resp = await client.post(
            "/api/training-records/bulk",
            json={"session_id": session.json()["id"], "trainee_ids": [str(t1.id), str(t2.id)]},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 200
        assert resp.json() == {"created": 1, "skipped": 1}
        assert await _count_records(db, t1.id) == 1


class TestImportDuplicate:
    async def test_preview_flags_existing_and_repeated_rows(self, client, db):
        _, token = await make_admin(db)
        _, trainee = await make_trainee(db, None, ci_raw=None, trainee_no="TR-DUP-I1", name="박수강")
        await db.commit()
        await client.post(
            "/api/training-records",
            json=_record_payload(trainee.id, course_name="SW개발보안", started_at="2025-06-01",
                                 ended_at="2025-06-30"),
            cookies=admin_cookie(token),
        )

        row_existing = ["박수강", "", "한국정보화진흥원", "SW개발보안", "2025.06.01", "2025.06.30", 8, 8]
        row_new = ["박수강", "", "한국정보화진흥원", "클라우드보안", "2025.07.01", "2025.07.30", 8, 8]
        resp = await preview(client, token, make_xlsx([row_existing, row_new, row_new]))
        assert resp.status_code == 200, resp.text
        flags = [r["is_duplicate"] for r in resp.json()["rows"]]
        assert flags == [True, False, True]  # 기존 내역 / 신규 / 같은 파일 반복 행

    async def test_confirm_survives_already_duplicated_records(self, client, db):
        """기존에 중복이 2건 이상 쌓여 있어도 확정이 깨지지 않고 건너뛴다."""
        _, token = await make_admin(db)
        _, trainee = await make_trainee(db, None, ci_raw=None, trainee_no="TR-DUP-I2", name="이수강")
        await db.commit()
        for _ in range(2):
            await client.post(
                "/api/training-records",
                json=_record_payload(trainee.id, course_name="SW개발보안", started_at="2025-06-01",
                                     ended_at="2025-06-30", allow_duplicate=True),
                cookies=admin_cookie(token),
            )

        resp = await client.post(
            "/api/training-records/import-confirm",
            json={"rows": [{
                "row_number": 2, "name": "이수강", "institution": "한국정보화진흥원",
                "subject": "SW개발보안", "start_date": "2025.06.01", "end_date": "2025.06.30",
                "hours_total": "8", "hours_recog": "8", "trainee_id": str(trainee.id),
            }]},
            cookies=admin_cookie(token),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["skipped"] == 1
        assert resp.json()["created"] == 0


class TestTraineeDuplicate:
    async def _post(self, client, token, **body):
        return await client.post("/api/trainees", json=body, cookies=admin_cookie(token))

    async def test_same_cert_no_is_blocked_even_when_forced(self, client, db):
        _, token = await make_admin(db)
        await db.commit()
        assert (await self._post(client, token, name="홍길동", cert_no="C-100")).status_code == 201

        resp = await self._post(client, token, name="다른사람", cert_no="C-100", allow_duplicate=True)
        assert resp.status_code == 409
        assert resp.json()["code"] == "DUPLICATE_TRAINEE"

    async def test_cert_no_matching_existing_senior_cert_no_is_blocked(self, client, db):
        _, token = await make_admin(db)
        await db.commit()
        await self._post(client, token, name="수석", cert_no="C-1", senior_cert_no="S-9")

        resp = await self._post(client, token, name="신규", cert_no="S-9")
        assert resp.status_code == 409
        assert resp.json()["code"] == "DUPLICATE_TRAINEE"

    async def test_same_name_and_birth_asks_then_allows(self, client, db):
        _, token = await make_admin(db)
        await db.commit()
        await self._post(client, token, name="김동명", birth_date="1980-01-01")

        resp = await self._post(client, token, name="김동명", birth_date="1980-01-01")
        assert resp.status_code == 409
        assert resp.json()["code"] == "DUPLICATE_TRAINEE_SUSPECTED"
        assert "김동명" in resp.json()["message"]

        forced = await self._post(
            client, token, name="김동명", birth_date="1980-01-01", allow_duplicate=True
        )
        assert forced.status_code == 201

    async def test_same_name_without_birth_date_is_allowed(self, client, db):
        _, token = await make_admin(db)
        await db.commit()
        await self._post(client, token, name="김이름")

        assert (await self._post(client, token, name="김이름")).status_code == 201
