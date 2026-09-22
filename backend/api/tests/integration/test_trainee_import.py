"""통합 — 교육생 엑셀 일괄 등록: 프리뷰(파싱·중복 판별) + 확정 등록."""

import io
from datetime import date

import openpyxl
from sqlalchemy import select

from app.core.crypto import decrypt_field
from app.domain.trainee.model import Trainee
from tests.integration.helpers import admin_cookie, make_admin, make_grade, make_trainee

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
HEADERS = [
    "감리원명",
    "전화번호",
    "생년월일",
    "감리원증번호",
    "감리원등급명",
    "감리원증발급일자",
]


def make_xlsx(rows: list[list], headers: list[str] | None = None) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers if headers is not None else HEADERS)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def upload_body(content: bytes) -> dict:
    return {"files": {"file": ("trainees.xlsx", content, XLSX_MIME)}}


async def preview(client, admin_token: str, content: bytes):
    return await client.post(
        "/api/trainees/import-preview",
        files={"file": ("trainees.xlsx", content, XLSX_MIME)},
        cookies=admin_cookie(admin_token),
    )


class TestImportPreview:
    async def test_preview_parses_rows_with_formats(self, client, db):
        _, admin_token = await make_admin(db)
        await db.commit()
        content = make_xlsx(
            [
                [
                    "김감리",
                    "010-1234-5678",
                    "1985.03.15",
                    "정보시스템감리협회 제100호",
                    "감리원",
                    date(2020, 5, 1),
                ],
                ["이감리", "01099998888", "1990/01/02", "", "수석감리원", ""],
            ]
        )

        resp = await preview(client, admin_token, content)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 2

        row1, row2 = body["rows"]
        assert (row1["row_number"], row1["name"]) == (2, "김감리")
        assert row1["phone"] == "01012345678"  # 구분자 제거
        assert str(row1["birth_date"]) == "1985-03-15"
        assert row1["cert_no"] == "정보시스템감리협회 제100호"
        assert row1["supervisor_grade"] == "감리원"
        assert str(row1["cert_issued_date"]) == "2020-05-01"  # 엑셀 date 셀
        assert row1["is_duplicate"] is False
        assert row1["errors"] == []
        assert str(row2["birth_date"]) == "1990-01-02"
        assert row2["cert_issued_date"] is None  # 빈 셀

    async def test_preview_flags_duplicate_by_name_birth_and_cert_no(self, client, db):
        grade = await make_grade(db, code="g-imp1", name="일반")
        _, existing = await make_trainee(
            db, grade.id, ci_raw="ci-imp1", trainee_no="TR-I-0001", name="기존사람"
        )
        existing.birth_date = date(1985, 3, 15)
        existing.cert_no = "협회 제200호"  # 엑셀 행의 감리원증번호와 동일 — 번호 중복 케이스
        _, admin_token = await make_admin(db)
        await db.commit()

        content = make_xlsx(
            [
                # 이름+생년월일 중복
                ["기존사람", "01011112222", "1985.03.15", "", "감리원", ""],
                # 감리원증번호 중복
                ["새사람", "01033334444", "", "협회 제200호", "감리원", ""],
                ["신규사람", "01055556666", "1995.07.07", "협회 제300호", "감리원", ""],
            ]
        )
        resp = await preview(client, admin_token, content)
        assert resp.status_code == 200
        rows = resp.json()["rows"]
        assert rows[0]["is_duplicate"] is True
        assert rows[0]["duplicate_of_name"] == "기존사람"
        assert rows[1]["is_duplicate"] is True
        assert rows[2]["is_duplicate"] is False

    async def test_preview_reports_missing_name_and_bad_dates(self, client, db):
        _, admin_token = await make_admin(db)
        await db.commit()
        content = make_xlsx([["", "01012345678", "잘못된날짜", "", "", ""]])

        resp = await preview(client, admin_token, content)
        assert resp.status_code == 200
        row = resp.json()["rows"][0]
        assert row["name"] is None
        assert row["birth_date"] is None
        assert any("감리원명" in e for e in row["errors"])
        assert any("생년월일" in e for e in row["errors"])

    async def test_preview_rejects_missing_header_and_bad_file(self, client, db):
        _, admin_token = await make_admin(db)
        await db.commit()

        bad_header = make_xlsx([["홍길동"]], headers=["이름"])
        resp = await preview(client, admin_token, bad_header)
        assert resp.status_code == 422
        assert "헤더" in resp.json()["message"]

        resp = await preview(client, admin_token, b"not an excel file")
        assert resp.status_code == 422

    async def test_preview_requires_admin(self, client, db):
        await db.commit()
        resp = await client.post(
            "/api/trainees/import-preview",
            files={"file": ("trainees.xlsx", make_xlsx([]), XLSX_MIME)},
        )
        assert resp.status_code == 401


class TestImportConfirm:
    async def test_confirm_creates_trainees_with_encrypted_phone(self, client, db):
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.post(
            "/api/trainees/import-confirm",
            json={
                "items": [
                    {
                        "row_number": 2,
                        "name": "엑셀사람",
                        "phone": "01012345678",
                        "birth_date": "1985-03-15",
                        "cert_no": "정보시스템감리협회 제400호",
                        "supervisor_grade": "감리원",
                        "cert_issued_date": "2020-05-01",
                    },
                    {
                        "row_number": 3,
                        "name": "두번째사람",
                    },
                ]
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json() == {"created": 2, "skipped": 0, "failed": []}

        rows = (
            (await db.execute(select(Trainee).where(Trainee.name == "엑셀사람")))
            .scalars()
            .all()
        )
        assert len(rows) == 1
        row = rows[0]
        assert row.review_status == "approved"
        assert row.reviewed_at is not None
        assert str(row.birth_date) == "1985-03-15"
        assert str(row.cert_issued_date) == "2020-05-01"
        assert row.supervisor_grade == "감리원"
        assert decrypt_field(row.phone_encrypted) == "01012345678"
        assert row.trainee_no.startswith("TR-")

    async def test_confirm_skips_duplicate_at_confirm_time(self, client, db):
        grade = await make_grade(db, code="g-imp2", name="일반")
        _, existing = await make_trainee(
            db, grade.id, ci_raw="ci-imp2", trainee_no="TR-I-0002", name="중복사람"
        )
        existing.birth_date = date(1990, 1, 2)
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.post(
            "/api/trainees/import-confirm",
            json={
                "items": [
                    {
                        "row_number": 2,
                        "name": "중복사람",
                        "birth_date": "1990-01-02",  # 기존과 동일 — 스킵
                    },
                    {"row_number": 3, "name": "정상사람"},
                ]
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json() == {"created": 1, "skipped": 1, "failed": []}

        dup = (
            (await db.execute(select(Trainee).where(Trainee.name == "중복사람")))
            .scalars()
            .all()
        )
        assert len(dup) == 1  # 기존 1명만

    async def test_confirm_requires_admin(self, client, db):
        await db.commit()
        resp = await client.post(
            "/api/trainees/import-confirm",
            json={"items": [{"row_number": 2, "name": "x"}]},
        )
        assert resp.status_code == 401
