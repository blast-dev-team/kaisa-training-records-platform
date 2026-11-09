"""통합 — 교육내역 등록 시 소스는 기관 구분을 따라 파생된다.

클라이언트가 보낸 source 는 무시하고, 연결된 기관의 구분(사내/외부)으로 결정한다.
기관 미연결이면 사내(internal) 기본값.
"""


from app.domain.institution.model import TrainingInstitution
from tests.integration.helpers import admin_cookie, make_admin, make_trainee


async def _inst(db, name: str, institution_type: str):
    inst = TrainingInstitution(name=name, institution_type=institution_type)
    db.add(inst)
    await db.flush()
    return inst


async def test_external_institution_derives_external(client, db):
    inst = await _inst(db, "외부기관-파생", "external")
    _, trainee = await make_trainee(db, None, ci_raw=None, name="김파생", trainee_no="TR-DERIVE-1")
    _, admin_token = await make_admin(db)
    await db.commit()

    resp = await client.post(
        "/api/training-records",
        json={
            "trainee_id": str(trainee.id),
            "institution_id": str(inst.id),
            "course_name": "파생 과정",
            "total_hours": "4",
            "started_at": "2026-10-05",
            "ended_at": "2026-10-06",
            "source": "internal",  # 클라이언트가 사내를 주장해도 기관 구분이 이긴다
        },
        cookies=admin_cookie(admin_token),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["source"] == "external"


async def test_internal_institution_derives_internal(client, db):
    inst = await _inst(db, "사내기관-파생", "internal")
    _, trainee = await make_trainee(db, None, ci_raw=None, name="이파생", trainee_no="TR-DERIVE-2")
    _, admin_token = await make_admin(db)
    await db.commit()

    resp = await client.post(
        "/api/training-records",
        json={
            "trainee_id": str(trainee.id),
            "institution_id": str(inst.id),
            "course_name": "파생 과정",
            "total_hours": "4",
            "started_at": "2026-10-05",
            "ended_at": "2026-10-06",
            "source": "external",  # 클라이언트가 외부를 주장해도 기관 구분이 이긴다
        },
        cookies=admin_cookie(admin_token),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["source"] == "internal"


async def test_missing_institution_defaults_internal(client, db):
    _, trainee = await make_trainee(db, None, ci_raw=None, name="박기본", trainee_no="TR-DERIVE-3")
    _, admin_token = await make_admin(db)
    await db.commit()

    resp = await client.post(
        "/api/training-records",
        json={
            "trainee_id": str(trainee.id),
            "course_name": "기관 미연결 과정",
            "institution_name": "미연결기관",
            "total_hours": "2",
            "started_at": "2026-10-05",
            "ended_at": "2026-10-06",
        },
        cookies=admin_cookie(admin_token),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["source"] == "internal"
