"""P07 be-me-identity 회귀 테스트 — 2026-11-18 QA 헌트에서 확인된 버그가 다시 생기지 않는지 검증한다."""

import uuid
from datetime import date

from sqlalchemy import select

from app.core.config import settings
from app.core.crypto import name_columns
from app.domain.identity.model import IdentityReview
from app.domain.trainee.model import Trainee
from app.integrations import portone
from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_record,
    make_trainee,
    member_cookie,
    member_token,
)


async def _pass_flow(client, monkeypatch, vid: str, customer: dict):
    async def fake_get(v):
        return {"id": v, "status": "VERIFIED", "verifiedCustomer": customer}

    monkeypatch.setattr(portone, "get_identity_verification", fake_get)
    start = await client.post("/api/auth/pass", json={"identity_verification_id": vid})
    state = start.json()["state"]
    return await client.post("/api/auth/pass/complete", json={"state": state})


# P07-1 -------------------------------------------------------------------
async def test_p07_1_stale_manual_review_after_auto_match(client, db, monkeypatch):
    """production: manual_review 대기 → 이관 교육생 등록 → 재인증 자동매칭.
    기대: 대기 심사 건이 정리되고(manual_review 아님), 승인 시도는 4xx.
    """
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    grade = await make_grade(db)
    _, admin_token = await make_admin(db)
    await db.commit()
    cust = {
        "ci": "ci-p07",
        "name": "박이관",
        "phoneNumber": "01022223333",
        "birthDate": "1980-05-05",
    }
    r1 = await _pass_flow(client, monkeypatch, "vid-p07-1", cust)
    assert r1.json()["review_status"] == "manual_review"

    # 이관 교육생(CI 없음) 이후 등록 — 이름+생년월일 일치
    enc, h = name_columns("박이관")
    db.add(
        Trainee(
            trainee_no="TR-LEG-1",
            name_encrypted=enc,
            name_hash=h,
            birth_date=date(1980, 5, 5),
            membership_grade_id=grade.id,
            review_status="unverified",
        )
    )
    await db.commit()
    r2 = await _pass_flow(client, monkeypatch, "vid-p07-2", cust)
    assert r2.json()["review_status"] == "approved"

    stale = (
        (
            await db.execute(
                select(IdentityReview).where(IdentityReview.status == "manual_review")
            )
        )
        .scalars()
        .all()
    )
    approve = None
    if stale:
        approve = await client.post(
            f"/api/identity-reviews/{stale[0].id}/approve",
            json={
                "new_trainee": {"name": "박이관"},
                "determined_grade_id": str(grade.id),
            },
            cookies=admin_cookie(admin_token),
        )
    assert not stale and approve is None, (
        f"stale manual_review left={len(stale)}; approve -> "
        f"{approve.status_code if approve else None}"
    )


# P07-2 -------------------------------------------------------------------
async def test_p07_2_approve_unknown_grade_id_500(client, db, monkeypatch):
    """trainee_id 경로 + 존재하지 않는 determined_grade_id → 기대 404, 실제 500(FK)."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    grade = await make_grade(db)
    _, trainee = await make_trainee(
        db, grade.id, ci_raw=None, name="최매칭", review_status="unverified"
    )
    _, admin_token = await make_admin(db)
    await db.commit()
    r = await _pass_flow(
        client,
        monkeypatch,
        "vid-p07-g",
        {"ci": "ci-g", "name": "다른이름", "phoneNumber": "01099990000"},
    )
    assert r.json()["review_status"] == "manual_review"
    review = (await db.execute(select(IdentityReview))).scalar_one()
    resp = await client.post(
        f"/api/identity-reviews/{review.id}/approve",
        json={"trainee_id": str(trainee.id), "determined_grade_id": str(uuid.uuid4())},
        cookies=admin_cookie(admin_token),
    )
    assert resp.status_code == 404, resp.status_code


# P07-3 -------------------------------------------------------------------
async def test_p07_3_no_period_record_shown_issuable(client, db):
    """수강 기간 없는 이력 — 발급 게이트는 400 차단인데 목록/상세는 issuable 로 표시."""
    grade = await make_grade(db)
    user, trainee = await make_trainee(db, grade.id)
    rec = await make_record(db, trainee.id, with_period=False)
    token = await member_token(db, user)
    await db.commit()
    lst = await client.get("/api/me/training-records", cookies=member_cookie(token))
    detail = await client.get(
        f"/api/me/training-records/{rec.id}", cookies=member_cookie(token)
    )
    assert lst.json()["items"][0]["certificate_status"] == "unavailable", lst.json()[
        "items"
    ][0]["certificate_status"]
    assert detail.json()["certificate_status"] == "unavailable"


# P07-4 -------------------------------------------------------------------
async def test_p07_4_search_wildcard_not_escaped(client, db):
    """search='%' 는 리터럴 % 검색이어야 하는데 전체 이력이 매칭된다."""
    grade = await make_grade(db)
    user, trainee = await make_trainee(db, grade.id)
    await make_record(db, trainee.id, record_no="R-1")
    token = await member_token(db, user)
    await db.commit()
    resp = await client.get(
        "/api/me/training-records", params={"search": "%"}, cookies=member_cookie(token)
    )
    assert resp.json()["total"] == 0, resp.json()["total"]
