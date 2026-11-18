"""P05 be-trainee 회귀 테스트 — 2026-11-18 QA 헌트에서 확인된 버그가 다시 생기지 않는지 검증한다."""

import io
from datetime import date

import openpyxl
from sqlalchemy import func, select

from app.domain.trainee.model import Trainee
from tests.integration.helpers import admin_cookie, make_admin, make_grade, make_trainee

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


async def _call(coro):
    """Return (status, resp); an unhandled server exception counts as 500."""
    try:
        resp = await coro
        return resp.status_code, resp
    except Exception as exc:  # ASGITransport re-raises app exceptions
        return 500, exc


async def _admin(db):
    _, tok = await make_admin(db)
    await db.commit()
    return admin_cookie(tok)


# P05-1 — 수기 등록 시 cert_issued_date 가 저장되지 않는다
async def test_create_persists_cert_issued_date(client, db):
    ck = await _admin(db)
    resp = await client.post(
        "/api/trainees",
        json={
            "name": "발급일",
            "cert_no": "협회 제1호",
            "cert_issued_date": "2020-05-01",
        },
        cookies=ck,
    )
    assert resp.status_code == 201
    assert resp.json()["cert_issued_date"] == "2020-05-01"  # actual: None


# P05-2 — 등급 PATCH 에 null 을 보내면 NOT NULL 위반 → 500
async def test_grade_patch_null_name_is_4xx(client, db):
    ck = await _admin(db)
    g = await make_grade(db, code="g-null", name="널등급")
    await db.commit()
    code, _ = await _call(
        client.patch(f"/api/membership-grades/{g.id}", json={"name": None}, cookies=ck)
    )
    assert 400 <= code < 500, code


# P05-3 — PATCH is_active=false 가 '배정 교육생 있으면 409' 가드를 우회한다
async def test_grade_deactivate_via_patch_blocked_when_assigned(client, db):
    ck = await _admin(db)
    g = await make_grade(db, code="g-used", name="사용중")
    await make_trainee(db, g.id, ci_raw=None, trainee_no="TR-P05-3")
    await db.commit()
    resp = await client.patch(
        f"/api/membership-grades/{g.id}", json={"is_active": False}, cookies=ck
    )
    assert resp.status_code == 409, resp.status_code  # DELETE 는 409, PATCH 는 200


# P05-4 — 길이/범위 초과 입력이 422 대신 500 (String(100)/String(50)/Integer)
async def test_create_trainee_long_cert_no_is_4xx(client, db):
    ck = await _admin(db)
    code, _ = await _call(
        client.post(
            "/api/trainees", json={"name": "긴번호", "cert_no": "1" * 101}, cookies=ck
        )
    )
    assert 400 <= code < 500, code


async def test_create_grade_sort_order_overflow_is_4xx(client, db):
    ck = await _admin(db)
    code, _ = await _call(
        client.post(
            "/api/membership-grades",
            json={"code": "big", "name": "큰값", "sort_order": 2**31},
            cookies=ck,
        )
    )
    assert 400 <= code < 500, code


# P05-5 — 엑셀 확정: 파일 내 같은 감리원증번호 두 행이 모두 등록된다
async def test_import_confirm_dedups_within_file(client, db):
    ck = await _admin(db)
    resp = await client.post(
        "/api/trainees/import-confirm",
        json={
            "items": [
                {"row_number": 2, "name": "갑", "cert_no": "협회 제777호"},
                {"row_number": 3, "name": "을", "cert_no": "협회 제777호"},
            ]
        },
        cookies=ck,
    )
    assert resp.status_code == 200
    n = (
        await db.execute(
            select(func.count())
            .select_from(Trainee)
            .where(Trainee.cert_no == "협회 제777호")
        )
    ).scalar_one()
    assert n == 1, f"{n} trainees share one cert_no; result={resp.json()}"


# P05-6 — 엑셀 확정: 한 행의 cert_no 가 100자 초과면 배치 전체가 500
async def test_import_confirm_long_cert_no_is_row_error(client, db):
    ck = await _admin(db)
    code, _resp = await _call(
        client.post(
            "/api/trainees/import-confirm",
            json={
                "items": [
                    {"row_number": 2, "name": "정상", "cert_no": "협회 제1호"},
                    {"row_number": 3, "name": "긴번호", "cert_no": "9" * 101},
                ]
            },
            cookies=ck,
        )
    )
    assert code == 200, code  # 기대: 행 3 만 failed


# P05-7 — 엑셀 확정 감사로그 name 이 모든 행에서 마지막 행 이름
async def test_import_confirm_audit_name_per_row(client, db):
    from app.domain.audit.model.audit_log import AuditLog as AL

    ck = await _admin(db)
    resp = await client.post(
        "/api/trainees/import-confirm",
        json={
            "items": [
                {"row_number": 2, "name": "김첫째"},
                {"row_number": 3, "name": "박둘째"},
            ]
        },
        cookies=ck,
    )
    assert resp.status_code == 200
    names = sorted(
        r.after_data["name"]
        for r in (
            await db.execute(select(AL).where(AL.action == "trainee.created"))
        ).scalars()
    )
    assert names == sorted(["김**", "박**"]), names


# P05-8 — 회원등급 일괄 적용 확정: 형식 오류 이메일 1건이 배치 전체를 500 으로
async def test_grade_import_confirm_bad_email_not_500(client, db):
    ck = await _admin(db)
    await make_grade(db, code="lifetime", name="평생")
    await make_grade(db, code="annual", name="연간")
    general = await make_grade(db, code="general", name="일반")
    _, t = await make_trainee(db, general.id, ci_raw=None, trainee_no="TR-P05-8")
    t.email = None
    await db.commit()
    code, _ = await _call(
        client.post(
            "/api/trainees/grade-import-confirm",
            json={
                "items": [
                    {
                        "row_number": 5,
                        "trainee_id": str(t.id),
                        "grade_code": "lifetime",
                        "email": "a..b@example.com",  # _EMAIL_RE 통과, EmailStr 거부
                    }
                ]
            },
            cookies=ck,
        )
    )
    assert code == 200, code


# P05-9 — 회원등급 일괄 적용: 수석감리원증번호만 가진 교육생이 증번호로 매칭되지 않는다
async def test_grade_import_matches_senior_cert_no(client, db):
    ck = await _admin(db)
    await make_grade(db, code="lifetime", name="평생")
    await make_grade(db, code="annual", name="연간")
    general = await make_grade(db, code="general", name="일반")
    _, t = await make_trainee(
        db, general.id, ci_raw=None, name="수석만", trainee_no="TR-P05-9"
    )
    t.birth_date = date(1970, 1, 1)
    t.senior_cert_no = "정보시스템감리협회 제9001호"
    t.supervisor_grade = "수석감리원"
    await db.commit()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "회원명부(평생회원)"
    ws.append(["성명", "생년월일", "감리원증번호"])
    ws.append(["수석만", "1970-01-02", "정보시스템감리협회 제9001호"])  # 생년 1일 오타
    buf = io.BytesIO()
    wb.save(buf)
    resp = await client.post(
        "/api/trainees/grade-import-preview",
        files={"file": ("m.xlsx", buf.getvalue(), XLSX_MIME)},
        cookies=ck,
    )
    assert resp.status_code == 200
    row = resp.json()["rows"][0]
    # 증번호 전체 일치가 1순위 — 생년이 다르면 CERT_COLLISION(block)이어야 한다
    assert row["match_mode"] == "cert", row


# P05-10 — 비활성(삭제된) 등급을 교육생에게 배정할 수 있다
async def test_assign_inactive_grade_rejected(client, db):
    ck = await _admin(db)
    g = await make_grade(db, code="g-old", name="폐지등급")
    g.is_active = False
    general = await make_grade(db, code="general", name="일반")
    _, t = await make_trainee(db, general.id, ci_raw=None, trainee_no="TR-P05-10")
    await db.commit()
    resp = await client.patch(
        f"/api/trainees/{t.id}", json={"membership_grade_id": str(g.id)}, cookies=ck
    )
    assert 400 <= resp.status_code < 500, resp.status_code


# P05-11 — 수정 시 다른 교육생의 감리원증번호로 바꿔도 막지 않는다 (등록은 항상 차단)
async def test_update_cert_no_duplicate_blocked(client, db):
    ck = await _admin(db)
    general = await make_grade(db, code="general", name="일반")
    _, a = await make_trainee(db, general.id, ci_raw=None, name="가", trainee_no="TR-A")
    _, b = await make_trainee(db, general.id, ci_raw=None, name="나", trainee_no="TR-B")
    a.cert_no = "협회 제5555호"
    await db.commit()
    resp = await client.patch(
        f"/api/trainees/{b.id}", json={"cert_no": "협회 제5555호"}, cookies=ck
    )
    assert resp.status_code == 409, resp.status_code


# P05-12 — 이름이 공백뿐이어도 등록된다 (빈 이름 교육생)
async def test_create_blank_name_rejected(client, db):
    ck = await _admin(db)
    resp = await client.post("/api/trainees", json={"name": "   "}, cookies=ck)
    assert 400 <= resp.status_code < 500, resp.status_code


# P05-13 — 목록 search 의 LIKE 와일드카드(%/_)를 이스케이프하지 않아 '%' 검색이 전체를 반환
async def test_list_search_percent_is_literal(client, db):
    ck = await _admin(db)
    general = await make_grade(db, code="general", name="일반")
    await make_trainee(db, general.id, ci_raw=None, name="가", trainee_no="TR-X1")
    await make_trainee(db, general.id, ci_raw=None, name="나", trainee_no="TR-X2")
    await db.commit()
    resp = await client.get("/api/trainees", params={"search": "%"}, cookies=ck)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0, resp.json()["total"]
