"""통합 — 교육생 등록 시 등급 미지정이면 일반 등급 기본값 적용.

2026-11-04 정책: 평생·연간 미지정 교육생은 일반 등급으로 등록한다.
수기 등록(create_trainee)과 엑셀 확정 등록(confirm_import) 전 경로 검증.
"""

from sqlalchemy import select

from app.domain.trainee.model import MembershipGrade, Trainee
from app.domain.trainee.schema.trainee import (
    TraineeImportConfirmItem,
    TraineeImportConfirmRequest,
)
from app.domain.trainee.service import trainee_service
from tests.integration.helpers import admin_cookie, make_admin, make_grade


async def _general_grade(db) -> MembershipGrade:
    grade = await make_grade(db, code="general", name="일반")
    return grade


async def test_create_trainee_defaults_to_general(client, db):
    general = await _general_grade(db)
    _, admin_token = await make_admin(db)
    await db.commit()
    resp = await client.post(
        "/api/trainees",
        json={"name": "기본등급테스트"},
        cookies=admin_cookie(admin_token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["grade_name"] == "일반"
    trainee = (
        await db.execute(select(Trainee).where(Trainee.trainee_no == body["trainee_no"]))
    ).scalar_one()
    assert trainee.membership_grade_id == general.id


async def test_create_trainee_explicit_grade_wins(client, db):
    annual = await make_grade(db, code="annual-dg", name="연간-기본값테스트")
    _, admin_token = await make_admin(db)
    await db.commit()
    resp = await client.post(
        "/api/trainees",
        json={
            "name": "명시등급테스트",
            "membership_grade_id": str(annual.id),
            "grade_expires_at": "2027-11-30",
        },
        cookies=admin_cookie(admin_token),
    )
    assert resp.status_code == 201
    assert resp.json()["grade_name"] == "연간-기본값테스트"


async def test_bulk_import_defaults_to_general(client, db):
    general = await _general_grade(db)
    admin, _admin_token = await make_admin(db)
    await db.commit()
    request = TraineeImportConfirmRequest(
        items=[
            TraineeImportConfirmItem(row_number=1, name="엑셀기본값1"),
            TraineeImportConfirmItem(row_number=2, name="엑셀기본값2"),
        ]
    )
    created, _skipped, _failed, _failures = await trainee_service.confirm_import(
        db, request, admin
    )
    assert created == 2
    from app.core.crypto import name_hash

    hashes = [name_hash(n) for n in ("엑셀기본값1", "엑셀기본값2")]
    got = (
        await db.execute(
            select(Trainee).where(
                Trainee.membership_grade_id == general.id,
                Trainee.name_hash.in_(hashes),
            )
        )
    ).scalars().all()
    assert len(got) == 2
