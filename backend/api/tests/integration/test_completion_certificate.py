"""통합 — 수료증: 내부 기관 게이트, 월별 리셋 채번, 멱등 재발급, 통합 진위확인."""

import uuid
from decimal import Decimal

from sqlalchemy import select

from app.core.audit import AuditLog
from app.domain.certificate.model import CompletionCertificate
from app.domain.institution.model.course_session import CourseSession
from app.domain.institution.model.session_name import SessionName
from app.domain.institution.model.training_course import TrainingCourse
from app.domain.institution.model.training_institution import TrainingInstitution
from app.domain.trainee.model import Trainee
from app.domain.user.model import User
from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_record,
    make_trainee,
    member_cookie,
    member_token,
)


async def _make_institution(
    db, name="한국감리협회", institution_type: str | None = "internal"
) -> TrainingInstitution:
    institution = TrainingInstitution(name=name, institution_type=institution_type)
    db.add(institution)
    await db.flush()
    return institution


async def _issue(client, db, record_id: uuid.UUID, admin_token: str):
    return await client.post(
        "/api/completion-certificates/issue",
        json={"training_record_ids": [str(record_id)]},
        cookies=admin_cookie(admin_token),
    )


async def _internal_record(db, suffix: str | None = None):
    """내부 기관 + 수료 완료 이력 1건. 등급·CI 는 고정값이라 호출마다 유니크 접미사."""
    suffix = suffix or uuid.uuid4().hex[:8]
    grade = await make_grade(
        db, code=f"g-cc-{suffix}", name="수료증등급"
    )
    _, trainee = await make_trainee(
        db, grade.id, ci_raw=f"ci-cc-{suffix}", trainee_no=f"TR-CC-{suffix}"
    )
    institution = await _make_institution(db)
    record = await make_record(
        db, trainee.id, record_no=f"TRN-CC-{suffix}"
    )
    record.institution_id = institution.id
    record.institution_name = institution.name
    await db.flush()
    return record, trainee, institution


class TestIssueGate:
    async def test_issue_internal_completed(self, client, db):
        record, _, _ = await _internal_record(db)
        _, token = await make_admin(db)
        await db.commit()

        resp = await _issue(client, db, record.id, token)
        assert resp.status_code == 201
        body = resp.json()[0]
        assert body["certificate_no"] == "2026-09-001호"
        assert body["institution_name"] == "한국감리협회"

    async def test_course_session_snapshot_mapping(self, client, db):
        """회차명 → 교육과정(session_name), 과정명 → 교육주제(course_name)."""
        from datetime import date
        from decimal import Decimal

        record, _, institution = await _internal_record(db)
        session_name = SessionName(name="2026년 제 9차 온라인계속교육")
        db.add(session_name)
        await db.flush()
        course = TrainingCourse(
            institution_id=institution.id,
            name="PMO 통합과정",
            session_name_id=session_name.id,
            total_hours=Decimal("24.00"),
        )
        db.add(course)
        await db.flush()
        session = CourseSession(
            course_id=course.id,
            started_at=date(2026, 9, 1),
            ended_at=date(2026, 9, 30),
            total_hours=Decimal("24.00"),
            recognized_hours=Decimal("24.00"),
        )
        db.add(session)
        await db.flush()
        record.session_id = session.id
        # 일정 연결로 생성된 이력은 과정 마스터명을 스냅샷으로 가진다
        record.course_name = course.name
        _, token = await make_admin(db)
        await db.commit()

        resp = await _issue(client, db, record.id, token)
        assert resp.status_code == 201
        body = resp.json()[0]
        # 교육과정 = 회차명, 교육주제 = 과정명
        assert body["session_name"] == "2026년 제 9차 온라인계속교육"
        assert body["course_name"] == "PMO 통합과정"

    async def test_external_institution_422(self, client, db):
        grade = await make_grade(db, code="g-ext", name="외부등급")
        _, trainee = await make_trainee(db, grade.id, ci_raw="ci-ext")
        institution = await _make_institution(db, "외부기관", institution_type="external")
        record = await make_record(db, trainee.id, record_no="TRN-CC-EXT")
        record.institution_id = institution.id
        record.institution_name = institution.name
        _, token = await make_admin(db)
        await db.commit()

        resp = await _issue(client, db, record.id, token)
        assert resp.status_code == 422
        assert resp.json()["code"] == "COMPLETION_CERTIFICATE_NOT_ALLOWED"

    async def test_unclassified_institution_422(self, client, db):
        """미선택(NULL) 기관 — 수료증 발급 불가."""
        grade = await make_grade(db, code="g-null", name="미선택등급")
        _, trainee = await make_trainee(db, grade.id, ci_raw="ci-null")
        institution = await _make_institution(db, "미분류기관", institution_type=None)
        record = await make_record(db, trainee.id, record_no="TRN-CC-NULL")
        record.institution_id = institution.id
        record.institution_name = institution.name
        _, token = await make_admin(db)
        await db.commit()

        resp = await _issue(client, db, record.id, token)
        assert resp.status_code == 422

    async def test_no_institution_422(self, client, db):
        grade = await make_grade(db, code="g-none", name="기관없음등급")
        _, trainee = await make_trainee(db, grade.id, ci_raw="ci-none")
        record = await make_record(db, trainee.id, record_no="TRN-CC-NONE")
        _, token = await make_admin(db)
        await db.commit()

        resp = await _issue(client, db, record.id, token)
        assert resp.status_code == 422

    async def test_not_completed_422(self, client, db):
        grade = await make_grade(db, code="g-prog", name="진행등급")
        _, trainee = await make_trainee(db, grade.id, ci_raw="ci-prog")
        institution = await _make_institution(db)
        record = await make_record(
            db, trainee.id, record_no="TRN-CC-PROG", completion_status="in_progress"
        )
        record.institution_id = institution.id
        record.institution_name = institution.name
        _, token = await make_admin(db)
        await db.commit()

        resp = await _issue(client, db, record.id, token)
        assert resp.status_code == 422

    async def test_unknown_record_404(self, client, db):
        _, token = await make_admin(db)
        await db.commit()
        resp = await _issue(client, db, uuid.uuid4(), token)
        assert resp.status_code == 404

    async def test_requires_admin(self, client, db):
        record, _, _ = await _internal_record(db)
        await db.commit()
        resp = await client.post(
            "/api/completion-certificates/issue",
            json={"training_record_ids": [str(record.id)]},
        )
        assert resp.status_code == 401


class TestNumbering:
    async def test_sequential_within_month(self, client, db):
        record, _, _ = await _internal_record(db)
        record2, _, _ = await _internal_record(db)
        _, token = await make_admin(db)
        await db.commit()

        first = (await _issue(client, db, record.id, token)).json()[0]
        second = (await _issue(client, db, record2.id, token)).json()[0]
        assert first["certificate_no"] == "2026-09-001호"
        assert second["certificate_no"] == "2026-09-002호"

    async def test_month_resets_after_month_boundary(self, client, db):
        """지난달 번호가 있어도 이번 달은 001부터 — prefix 필터 검증.

        KST 새벽(월 경계)에도 prefix 가 이번 달로 고정되는지가 핵심이라
        이번 달 번호를 미리 심지 않고, 지난달 번호만 심는다.
        """
        record, _, _ = await _internal_record(db)
        # 지난달 번호 소유자 — FK 를 만족하는 별도 이력
        past_record, _, _ = await _internal_record(db)
        db.add(
            CompletionCertificate(
                certificate_no="2026-08-099호",
                training_record_id=past_record.id,
                trainee_id=record.trainee_id,
                issued_name_encrypted="x",
                issued_name_hash="y",
                course_name="과거교육",
                institution_name="한국감리협회",
                completed_hours=Decimal("8.00"),
                issued_at=record.completed_at,
            )
        )
        _, token = await make_admin(db)
        await db.commit()

        resp = await _issue(client, db, record.id, token)
        assert resp.status_code == 201
        assert resp.json()[0]["certificate_no"] == "2026-09-001호"


class TestIdempotency:
    async def test_reissue_returns_same_certificate(self, client, db):
        record, _, _ = await _internal_record(db)
        _, token = await make_admin(db)
        await db.commit()

        first = (await _issue(client, db, record.id, token)).json()[0]
        second = (await _issue(client, db, record.id, token)).json()[0]
        assert first["id"] == second["id"]
        assert first["certificate_no"] == second["certificate_no"]
        certs = (
            (await db.execute(select(CompletionCertificate))).scalars().all()
        )
        assert len(certs) == 1

    async def test_issue_logged_in_audit(self, client, db):
        record, _, _ = await _internal_record(db)
        _, token = await make_admin(db)
        await db.commit()

        await _issue(client, db, record.id, token)
        logs = (
            await db.execute(
                select(AuditLog).where(
                    AuditLog.action == "completion_certificate.issued"
                )
            )
        ).scalars()
        assert len(list(logs)) == 1


class TestUnifiedVerification:
    async def _verify(self, client, no: str):
        return await client.post(
            "/api/public/certificate-verifications",
            json={"certificate_no": no},
        )

    async def test_verify_completion_certificate(self, client, db):
        record, _, _ = await _internal_record(db)
        record.started_at = record.ended_at
        _, token = await make_admin(db)
        await db.commit()

        cert = (await _issue(client, db, record.id, token)).json()[0]

        # '호' 접미사 없이도 조회된다
        for no in (cert["certificate_no"], cert["certificate_no"].rstrip("호")):
            resp = await self._verify(client, no)
            assert resp.status_code == 200
            body = resp.json()
            assert body["result"] == "valid"
            assert body["kind"] == "completion_certificate"
            assert body["certificate_no"] == cert["certificate_no"]
            assert body["issued_name_masked"] == "홍**"
            assert "홍길동" not in resp.text

    async def test_certificate_kind_still_works(self, client, db):
        resp = await self._verify(client, "CERT-DOES-NOT-EXIST")
        assert resp.status_code == 200
        body = resp.json()
        assert body["result"] == "not_found"
        assert body["kind"] == "certificate"


class TestWebIssue:
    """웹 회원 발급 — POST /api/me/completion-certificates (소유 이력만, 무료)."""

    async def _issue_web(self, client, record_ids: list[uuid.UUID], token: str):
        return await client.post(
            "/api/me/completion-certificates",
            json={"training_record_ids": [str(rid) for rid in record_ids]},
            cookies=member_cookie(token),
        )

    async def _owner_token(self, db, record) -> str:
        trainee = await db.get(Trainee, record.trainee_id)
        user = await db.get(User, trainee.user_id)
        return await member_token(db, user)

    async def test_issue_own_internal_completed(self, client, db):
        record, _, _ = await _internal_record(db)
        token = await self._owner_token(db, record)
        await db.commit()

        resp = await self._issue_web(client, [record.id], token)
        assert resp.status_code == 201
        body = resp.json()[0]
        assert body["certificate_no"] == "2026-09-001호"
        assert body["trainee_name"] == "홍길동"

    async def test_other_trainee_record_404(self, client, db):
        """타인 이력·공용 데모 이력 — 소유 검사로 404. 존재 여부를 노출하지 않는다."""
        record, _, _ = await _internal_record(db)
        grade = await make_grade(db, code="g-web2", name="웹회원2")
        _, stranger = await make_trainee(
            db, grade.id, ci_raw="ci-web2", trainee_no="TR-WEB-2"
        )
        token_user = await db.get(User, stranger.user_id)
        token = await member_token(db, token_user)
        await db.commit()

        resp = await self._issue_web(client, [record.id], token)
        assert resp.status_code == 404

    async def test_external_institution_422(self, client, db):
        grade = await make_grade(db, code="g-webext", name="웹외부")
        _, trainee = await make_trainee(
            db, grade.id, ci_raw="ci-webext", trainee_no="TR-WEB-EXT"
        )
        institution = await _make_institution(db, "웹외부기관", institution_type="external")
        record = await make_record(db, trainee.id, record_no="TRN-WEB-EXT")
        record.institution_id = institution.id
        record.institution_name = institution.name
        token_user = await db.get(User, trainee.user_id)
        token = await member_token(db, token_user)
        await db.commit()

        resp = await self._issue_web(client, [record.id], token)
        assert resp.status_code == 422
        assert resp.json()["code"] == "COMPLETION_CERTIFICATE_NOT_ALLOWED"

    async def test_idempotent_reissue(self, client, db):
        record, _, _ = await _internal_record(db)
        token = await self._owner_token(db, record)
        await db.commit()

        first = (await self._issue_web(client, [record.id], token)).json()[0]
        second = (await self._issue_web(client, [record.id], token)).json()[0]
        assert first["id"] == second["id"]
        certs = (
            (await db.execute(select(CompletionCertificate))).scalars().all()
        )
        assert len(certs) == 1

    async def test_audit_records_web_actor(self, client, db):
        record, trainee, _ = await _internal_record(db)
        token = await self._owner_token(db, record)
        await db.commit()

        await self._issue_web(client, [record.id], token)
        logs = (
            await db.execute(
                select(AuditLog).where(
                    AuditLog.action == "completion_certificate.issued"
                )
            )
        ).scalars()
        log = list(logs)[0]
        assert log.actor_admin_id is None
        assert log.after_data["actor"] == "web"
        assert log.after_data["trainee_id"] == str(trainee.id)

    async def test_requires_member(self, client, db):
        record, _, _ = await _internal_record(db)
        await db.commit()
        resp = await client.post(
            "/api/me/completion-certificates",
            json={"training_record_ids": [str(record.id)]},
        )
        assert resp.status_code == 401
