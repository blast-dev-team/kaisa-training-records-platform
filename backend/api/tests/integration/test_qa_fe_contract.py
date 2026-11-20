"""FE↔BE 계약 회귀 테스트 — 2026-11-18 수정 후 ADMIN 이 실제로 보내는 요청 모양으로 끝까지 검증한다.

(수정 전 ADMIN 은 camelCase 비밀번호 본문, member_count 키, 이름만 고쳐도 등급 포함 전체 본문을 보냈다.
 서버 계약은 그대로이고 FE 를 고쳤으므로, 여기서는 '고친 FE 의 요청'이 의도대로 처리되는지 본다.)
"""

from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_record,
    make_trainee,
)


async def test_admin_password_change_with_fe_snake_case_body(client, db):
    """patch-my-password.ts 는 이제 current_password·new_password 로 보낸다 → 200."""
    _admin, token = await make_admin(db)
    await db.commit()
    r = await client.patch(
        "/api/auth/password",
        json={"current_password": "admin-passw0rd", "new_password": "new-passw0rd-1"},
        cookies=admin_cookie(token),
    )
    assert r.status_code in (200, 204), r.json() if r.content else r.status_code


async def test_admin_password_change_wrong_current_is_invalid_credentials_not_session_end(
    client, db
):
    """현재 비밀번호 오류는 401 INVALID_CREDENTIALS — FE 는 이 코드로는 로그아웃하지 않는다."""
    _admin, token = await make_admin(db)
    await db.commit()
    r = await client.patch(
        "/api/auth/password",
        json={"current_password": "wrong-passw0rd", "new_password": "new-passw0rd-1"},
        cookies=admin_cookie(token),
    )
    assert r.status_code == 401
    assert r.json()["code"] == "INVALID_CREDENTIALS"
    # 세션은 살아 있다
    me = await client.get("/api/auth/me", cookies=admin_cookie(token))
    assert me.status_code == 200


async def test_password_change_rate_limited_after_repeated_failures(client, db):
    """현재 비밀번호 대입 방지 — 5회 실패 후 6번째는 429 TOO_MANY_ATTEMPTS."""
    _admin, token = await make_admin(db)
    await db.commit()
    body = {"current_password": "wrong-passw0rd", "new_password": "new-passw0rd-1"}
    for _ in range(5):
        r = await client.patch(
            "/api/auth/password", json=body, cookies=admin_cookie(token)
        )
        assert r.status_code == 401
    r = await client.patch("/api/auth/password", json=body, cookies=admin_cookie(token))
    assert r.status_code == 429
    assert r.json()["code"] == "TOO_MANY_ATTEMPTS"


async def test_certificate_list_sends_record_count_used_by_fe(client, db):
    """map-certificate.ts 는 이제 record_count 를 읽는다 — 묶음 2건이면 2."""
    _admin, token = await make_admin(db)
    grade = await make_grade(db)
    _user, trainee = await make_trainee(db, grade.id)
    r1 = await make_record(db, trainee.id, record_no="TRN-2026-0001")
    r2 = await make_record(db, trainee.id, record_no="TRN-2026-0002")
    await db.commit()
    issued = await client.post(
        "/api/certificates/issue",
        json={
            "groups": [
                {"trainee_id": str(trainee.id), "record_ids": [str(r1.id), str(r2.id)]}
            ]
        },
        cookies=admin_cookie(token),
    )
    assert issued.status_code == 200, issued.json()
    listed = await client.get("/api/certificates", cookies=admin_cookie(token))
    assert listed.json()["items"][0]["record_count"] == 2


async def _trainee_with_grade(db, grade_value):
    _, tok = await make_admin(db)
    g = await make_grade(db)
    _, t = await make_trainee(db, g.id, ci_raw=None)
    t.cert_no = "협회 제1호"
    t.supervisor_grade = grade_value
    await db.commit()
    return admin_cookie(tok), t


async def test_name_only_edit_payload_keeps_senior_without_number(client, db):
    """trainee-form-dialog 는 이제 바뀐 칸만 보낸다 — 이름만 고치면 {name} 만."""
    ck, t = await _trainee_with_grade(db, "수석감리원")
    r = await client.patch(
        f"/api/trainees/{t.id}", json={"name": "홍길동2"}, cookies=ck
    )
    assert r.status_code == 200
    assert r.json()["supervisor_grade"] == "수석감리원"


async def test_name_only_edit_payload_keeps_unassigned_grade(client, db):
    ck, t = await _trainee_with_grade(db, None)
    r = await client.patch(
        f"/api/trainees/{t.id}", json={"name": "홍길동2"}, cookies=ck
    )
    assert r.status_code == 200
    assert r.json()["supervisor_grade"] is None


async def test_disabling_admin_revokes_sessions_and_restore_requires_login(client, db):
    """운영 판단 반영 — 차단하면 즉시 로그아웃, 복구해도 예전 세션은 살아나지 않는다."""
    _super_admin, super_token = await make_admin(db, email="super@example.com")
    staff, staff_token = await make_admin(db, email="staff@example.com", role="staff")
    await db.commit()
    assert (
        await client.get("/api/auth/me", cookies=admin_cookie(staff_token))
    ).status_code == 200

    r = await client.patch(
        f"/api/admin-users/{staff.id}",
        json={"status": "disabled"},
        cookies=admin_cookie(super_token),
    )
    assert r.status_code == 200
    assert (
        await client.get("/api/auth/me", cookies=admin_cookie(staff_token))
    ).status_code == 401

    r = await client.patch(
        f"/api/admin-users/{staff.id}",
        json={"status": "active"},
        cookies=admin_cookie(super_token),
    )
    assert r.status_code == 200
    # 복구 후에도 차단 전 세션은 죽어 있다 — 다시 로그인해야 한다
    assert (
        await client.get("/api/auth/me", cookies=admin_cookie(staff_token))
    ).status_code == 401
    login = await client.post(
        "/api/auth/login",
        json={"email": "staff@example.com", "password": "admin-passw0rd"},
    )
    assert login.status_code == 200
