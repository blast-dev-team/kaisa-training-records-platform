"""통합 — 수강 기간 미기재 이력의 확인서·수료증 발급 차단.

레거시 이관분 중 원본에 기간이 없는 이력(2,710건)은 문서에 기간이 비어
발급되면 안 된다 — WEB 신청·어드민 발급 전 경로에서 게이트로 막는다.
"""

import uuid

from app.domain.institution.model import TrainingInstitution
from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_record,
    make_trainee,
    member_cookie,
    member_token,
)


async def _null_period_record(db, suffix: str):
    """기간 미기재 이력 1건 (교육생 + 등급 포함)."""
    grade = await make_grade(db, code=f"g-pg-{suffix}", name="기간가드등급")
    user, trainee = await make_trainee(
        db, grade.id, ci_raw=f"ci-pg-{suffix}", trainee_no=f"TR-2026-PG{suffix}"
    )
    record = await make_record(
        db, trainee.id, record_no=f"TRN-PG-{suffix}", with_period=False
    )
    return user, trainee, record


async def _attach_internal_institution(db, record):
    """수료증 게이트(internal 기관) 통과용 — 기관 연결."""
    institution = TrainingInstitution(name="내부기관", institution_type="internal")
    db.add(institution)
    await db.flush()
    record.institution_id = institution.id
    await db.flush()


async def test_web_certificate_request_blocked(client, db):
    user, _, record = await _null_period_record(db, "w1")
    token = await member_token(db, user)
    await db.commit()
    resp = await client.post(
        "/api/certificate-requests",
        json={"training_record_id": str(record.id)},
        cookies=member_cookie(token),
    )
    assert resp.status_code == 422
    assert "수강 기간" in resp.json()["message"]


async def test_web_certificate_batch_blocked_if_any_null_period(client, db):
    grade = await make_grade(db, code="g-pg-b", name="기간가드등급")
    user, trainee = await make_trainee(
        db, grade.id, ci_raw="ci-pg-b", trainee_no="TR-2026-PGB"
    )
    ok = await make_record(db, trainee.id, record_no="TRN-PG-B1")  # 기간 있음
    bad = await make_record(
        db, trainee.id, record_no="TRN-PG-B2", with_period=False
    )
    token = await member_token(db, user)
    await db.commit()
    resp = await client.post(
        "/api/certificate-requests/batch",
        json={
            "items": [
                {"training_record_id": str(ok.id)},
                {"training_record_id": str(bad.id)},
            ]
        },
        cookies=member_cookie(token),
    )
    assert resp.status_code == 422


async def test_admin_certificate_issue_blocked(client, db):
    _, _, record = await _null_period_record(db, "a1")
    _, admin_token = await make_admin(db)
    await db.commit()
    resp = await client.post(
        "/api/certificates/issue",
        json={
            "groups": [
                {
                    "trainee_id": str(record.trainee_id),
                    "record_ids": [str(record.id)],
                }
            ]
        },
        cookies=admin_cookie(admin_token),
    )
    assert resp.status_code == 422
    assert "수강 기간" in resp.json()["message"]


async def test_admin_completion_certificate_blocked(client, db):
    _, _, record = await _null_period_record(db, "c1")
    await _attach_internal_institution(db, record)
    _, admin_token = await make_admin(db)
    await db.commit()
    resp = await client.post(
        "/api/completion-certificates/issue",
        json={"training_record_ids": [str(record.id)]},
        cookies=admin_cookie(admin_token),
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "COMPLETION_CERTIFICATE_PERIOD_MISSING"
