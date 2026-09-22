"""Integration: excel match-preview for attach-trainees dialog."""
import io

import openpyxl

from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_trainee,
)

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MATCH_HEADERS = ["교육생명", "교육생번호", "감리원증번호"]


def make_xlsx(rows, headers=None):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers if headers is not None else MATCH_HEADERS)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


async def preview(client, token, content):
    return await client.post(
        "/api/training-records/match-preview",
        files={"file": ("match.xlsx", content, XLSX_MIME)},
        cookies=admin_cookie(token),
    )


async def seed(db, no, name=None, cert=None, trainee_no=None):
    """grade + trainee 1명. cert_no 는 헬퍼가 안 받아서 생성 후 채운다."""
    grade = await make_grade(db, code=f"g-{no}", name=f"등급{no}")
    _, t = await make_trainee(
        db, grade.id,
        ci_raw=f"ci-{no}",
        name=name or f"훈수사{no}",
        trainee_no=trainee_no or f"TR-{no:04d}",
    )
    t.cert_no = cert
    await db.flush()
    return t


class TestMatchPriority:
    async def test_match_by_cert_no(self, client, db):
        _, token = await make_admin(db)
        await seed(db, 1, name="김감리", cert="정보시스템감리협회 제100호")
        await db.commit()

        content = make_xlsx([
            ["김감리", "", "정보시스템감리협회 제100호"],
        ])
        resp = await preview(client, token, content)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_rows"] == 1
        m = body["matched"][0]
        assert m["matched_by"] == "cert_no"
        assert m["trainee_no"] == "TR-0001"
        assert body["unmatched"] == []

    async def test_match_by_trainee_no_numeric_cell(self, client, db):
        _, token = await make_admin(db)
        await seed(db, 2, name="이감리", trainee_no="2002")
        await db.commit()

        # 엑셀 숫자 셀은 int 로 읽혀도 문자열로 정규화돼 매칭된다
        content = make_xlsx([["이감리", 2002, ""]])
        resp = await preview(client, token, content)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["matched"]) == 1
        assert body["matched"][0]["matched_by"] == "trainee_no"
        assert body["matched"][0]["trainee_no"] == "2002"


class TestMatchFallbackAndReject:
    async def test_name_only_unique_matches(self, client, db):
        _, token = await make_admin(db)
        await seed(db, 3, name="박감리")
        await db.commit()

        resp = await preview(client, token, make_xlsx([["박감리", "", ""]]))
        body = resp.json()
        assert body["matched"][0]["matched_by"] == "name"

    async def test_name_ambiguous_goes_unmatched(self, client, db):
        _, token = await make_admin(db)
        await seed(db, 4, name="동일이")
        await seed(db, 5, name="동일이")
        await db.commit()

        resp = await preview(client, token, make_xlsx([["동일이", "", ""]]))
        body = resp.json()
        assert body["matched"] == []
        assert body["unmatched"][0]["reason"].startswith("동일한 이름")

    async def test_no_match_row(self, client, db):
        _, token = await make_admin(db)
        await seed(db, 6, name="있는사람")
        await db.commit()

        resp = await preview(client, token, make_xlsx([
            ["없는사람", "9999", ""],
            ["없는사람2", "", "협회 제999호"],
        ]))
        body = resp.json()
        assert body["matched"] == []
        assert body["unmatched"][0]["reason"] == "교육생 목록에서 찾을 수 없어요"
        # 엑셀에 있던 증번호는 직접 등록 시 재사용할 수 있게 그대로 돌려준다
        assert body["unmatched"][1]["cert_no"] == "협회 제999호"

    async def test_excel_internal_duplicate(self, client, db):
        _, token = await make_admin(db)
        await seed(db, 7, name="중복이", cert="협회 제700호")
        await db.commit()

        resp = await preview(client, token, make_xlsx([
            ["중복이", "", "협회 제700호"],
            ["중복이", "", "협회 제700호"],
        ]))
        body = resp.json()
        assert len(body["matched"]) == 1
        assert body["unmatched"][0]["reason"] == "엑셀 안에서 중복된 교육생이에요"

    async def test_empty_rows_skipped_and_bad_file_rejected(self, client, db):
        _, token = await make_admin(db)
        await seed(db, 8)
        await db.commit()

        resp = await preview(client, token, make_xlsx([["", "", ""], ["훈수사8", "", ""]]))
        assert resp.json()["total_rows"] == 1

        bad = await preview(client, token, b"not an excel file")
        assert bad.status_code == 422

    async def test_unknown_headers_rejected(self, client, db):
        _, token = await make_admin(db)
        await db.commit()

        resp = await preview(
            client, token,
            make_xlsx([["아무개", "1", "2"]], headers=["이상한컬럼", "A", "B"]),
        )
        assert resp.status_code == 422
