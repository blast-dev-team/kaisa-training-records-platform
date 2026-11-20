"""P03 be-certificate 회귀 테스트 — 2026-11-18 QA 헌트에서 확인된 버그가 다시 생기지 않는지 검증한다."""

from sqlalchemy import select

from app.core.kst import now_kst
from app.domain.certificate.model import CompletionCertificate
from app.domain.institution.model import TrainingInstitution
from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_pricing,
    make_record,
    make_trainee,
    member_cookie,
    member_token,
)


async def _member(db, n=1, code="g-p03"):
    grade = await make_grade(db, code=code, name="P03등급")
    user, trainee = await make_trainee(
        db, grade.id, ci_raw=f"ci-{code}", trainee_no="TR-2026-P003"
    )
    records = [
        await make_record(db, trainee.id, record_no=f"TRN-P03-{i:04d}")
        for i in range(n)
    ]
    await make_pricing(db, grade.id, price_krw=0)
    token = await member_token(db, user)
    return trainee, records, token


async def test_P03_1_admin_list_record_count_when_search_matches_one_member(client, db):
    """Bundle of 3; search by one member's course name -> record_count should stay 3."""
    _, records, token = await _member(db, n=3)
    for i, r in enumerate(records):
        r.course_name = f"과정-{i}-고유명"
    _, admin_token = await make_admin(db)
    await db.commit()
    resp = await client.post(
        "/api/certificate-requests/batch",
        json={"items": [{"training_record_id": str(r.id)} for r in records]},
        cookies=member_cookie(token),
    )
    assert resp.status_code == 201, resp.json()

    full = await client.get("/api/certificates", cookies=admin_cookie(admin_token))
    assert full.json()["items"][0]["record_count"] == 3

    searched = await client.get(
        "/api/certificates",
        params={"search": "과정-2-고유명"},
        cookies=admin_cookie(admin_token),
    )
    body = searched.json()
    assert body["total"] == 1
    item = body["items"][0]
    # same issuance event -> same representative and same size as the unfiltered list
    assert item["record_count"] == 3
    assert item["id"] == full.json()["items"][0]["id"]


async def _internal_deleted_record(db, trainee, record):
    inst = TrainingInstitution(name="카이사", institution_type="internal")
    db.add(inst)
    await db.flush()
    record.institution_id = inst.id
    record.deleted_at = now_kst()
    await db.flush()


async def test_P03_2_member_completion_cert_for_soft_deleted_record(client, db):
    trainee, (record,), token = await _member(db)
    await _internal_deleted_record(db, trainee, record)
    await db.commit()
    resp = await client.post(
        "/api/me/completion-certificates",
        json={"training_record_ids": [str(record.id)]},
        cookies=member_cookie(token),
    )
    issued = (await db.execute(select(CompletionCertificate))).scalars().all()
    assert resp.status_code == 404, resp.json()
    assert issued == []


async def test_P03_3_admin_completion_cert_for_soft_deleted_record(client, db):
    trainee, (record,), _ = await _member(db)
    await _internal_deleted_record(db, trainee, record)
    _, admin_token = await make_admin(db)
    await db.commit()
    resp = await client.post(
        "/api/completion-certificates/issue",
        json={"training_record_ids": [str(record.id)]},
        cookies=admin_cookie(admin_token),
    )
    assert resp.status_code == 404, resp.json()


async def test_P03_4_admin_certificate_issue_for_soft_deleted_record(client, db):
    trainee, (record,), _ = await _member(db)
    record.deleted_at = now_kst()
    _, admin_token = await make_admin(db)
    await db.commit()
    resp = await client.post(
        "/api/certificates/issue",
        json={
            "groups": [{"trainee_id": str(trainee.id), "record_ids": [str(record.id)]}]
        },
        cookies=admin_cookie(admin_token),
    )
    assert resp.status_code == 404, resp.json()


async def test_P03_5_member_batch_empty_items_rejected(client, db):
    _, _, token = await _member(db)
    await db.commit()
    resp = await client.post(
        "/api/certificate-requests/batch",
        json={"items": []},
        cookies=member_cookie(token),
    )
    assert resp.status_code == 422, (resp.status_code, resp.json())
