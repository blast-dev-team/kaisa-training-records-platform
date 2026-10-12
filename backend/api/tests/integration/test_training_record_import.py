"""통합 — 교육내역 엑셀 일괄 등록: 제목 행 아래 헤더 탐색 + 감리원 매칭 + 확정 등록."""

import io

import openpyxl

from tests.integration.helpers import admin_cookie, make_admin, make_grade, make_trainee

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def make_xlsx(rows: list[list], headers: list[str] | None = None, title_rows: int = 0) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    for _ in range(title_rows):
        ws.append(["업로드 안내 제목 행"])
    ws.append(headers if headers is not None else [
        "교육생명", "감리원증번호", "교육기관명", "과목명",
        "시작일자", "종료일자", "교육시간", "인정시간",
    ])
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


async def preview(client, admin_token: str, content: bytes):
    return await client.post(
        "/api/training-records/import-preview",
        files={"file": ("records.xlsx", content, XLSX_MIME)},
        cookies=admin_cookie(admin_token),
    )


async def test_preview_finds_header_below_title_rows_and_matches(client, db):
    """제목 행 2개 아래 헤더 — 감리원증번호로 매칭되고 오류 없음."""
    grade = await make_grade(db, code="g-ti", name="일반")
    await make_trainee(db, grade.id, ci_raw="ci-ti", trainee_no="TR-I-100", name="김수강")
    _, admin_token = await make_admin(db)
    await db.commit()

    content = make_xlsx(
        [["김수강", "TR-TEST-1", "한국정보화진흥원", "SW개발보안", "2025.06.01", "2025.06.30", 8, 8]],
        headers=["이 름", "감리원증 번호", "교육기관명", "과목명", "시작일자", "종료일자", "교육시간", "인정시간"],
        title_rows=2,
    )
    resp = await preview(client, admin_token, content)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    row = body["rows"][0]
    assert row["trainee_name"] == "김수강"
    assert row["errors"] == []


async def test_confirm_creates_external_record_and_skips_duplicate(client, db):
    from sqlalchemy import select

    from app.domain.training_record.model import TrainingRecord

    grade = await make_grade(db, code="g-ti2", name="일반")
    await make_trainee(db, grade.id, ci_raw="ci-ti2", trainee_no="TR-I-200", name="박수강")
    _, admin_token = await make_admin(db)
    await db.commit()

    # 프리뷰로 trainee_id 확정 → 확정 요청
    pv = await preview(client, admin_token, make_xlsx([
        ["박수강", "", "한국정보화진흥원", "SW개발보안", "2025.06.01", "2025.06.30", 8, 8],
    ]))
    tid = pv.json()["rows"][0]["trainee_id"]
    assert tid is not None

    payload = {
        "rows": [{
            "row_number": 2,
            "name": "박수강",
            "cert_no": None,
            "institution": "한국정보화진흥원",
            "subject": "SW개발보안",
            "start_date": "2025-06-01",
            "end_date": "2025-06-30",
            "hours_total": "8",
            "hours_recog": "8",
            "trainee_id": tid,
        }]
    }
    resp = await client.post(
        "/api/training-records/import-confirm",
        json=payload,
        cookies=admin_cookie(admin_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["created"] == 1

    rec = (
        await db.execute(select(TrainingRecord).where(TrainingRecord.course_name == "SW개발보안"))
    ).scalars().first()
    assert rec is not None
    assert rec.source == "external"
    assert rec.completed_hours == 8

    # 같은 감리원·과정·시작일 재확정 → 중복 skip
    resp2 = await client.post(
        "/api/training-records/import-confirm",
        json=payload,
        cookies=admin_cookie(admin_token),
    )
    assert resp2.status_code == 200
    body = resp2.json()
    assert body["created"] == 0 and body["skipped"] == 1


async def test_preview_reports_unmatched_and_missing_fields(client, db):
    _, admin_token = await make_admin(db)
    await db.commit()

    content = make_xlsx([
        ["없는사람", "", "기관", "과목", "", "", "", ""],
        ["", "", "", "", "", "", "", ""],  # 완전히 빈 행 — 스킵
    ])
    resp = await preview(client, admin_token, content)
    assert resp.status_code == 200
    rows = resp.json()["rows"]
    assert len(rows) == 1  # 빈 행은 제외
    row = rows[0]
    assert row["trainee_id"] is None
    assert any("감리원" in e for e in row["errors"])
