"""통합 — 엑셀 회원등급 일괄 적용: 프리뷰(매칭·검증 리포트) + 확정 적용.

수작업 검증에서 실제로 발견된 케이스(증번호 충돌 오매칭, 이름·생년 오타, 파일 내
중복, 평생↔연간 충돌)를 회귀 테스트로 고정한다.
"""

import io
import uuid
from datetime import date

import openpyxl
from sqlalchemy import select

from app.domain.trainee.model import Trainee, TraineeGradeHistory
from tests.integration.helpers import admin_cookie, make_admin, make_grade, make_trainee

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

HEADERS = [
    "번호",
    "회원구분",
    "성명",
    "생년월일",
    "감리원증번호",
    "연락처",
    "e-mail",
    "26년 납부일",
    "25년 납부일",
]

LIFETIME_SHEET = "회원명부(평생회원)"
ANNUAL_SHEET = "회원명부(연간회원) "


def make_book(
    sheets: dict[str, list[list]],
    highlight_rows: dict[str, set[int]] | None = None,
) -> bytes:
    """시트명 → 행 목록으로 명부 xlsx 생성. highlight_rows 는 배경색 칠할 데이터 행(1-based)."""
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for sheet_name, rows in sheets.items():
        ws = wb.create_sheet(title=sheet_name)
        ws.append(["정보시스템감리협회 회원 명부"])  # 제목 행 — 헤더 탐지 회귀용
        ws.append(HEADERS)
        for row in rows:
            ws.append(row)
        for data_idx in (highlight_rows or {}).get(sheet_name, set()):
            fill = openpyxl.styles.PatternFill("solid", fgColor="FFF8E7EE")
            for cell in ws[data_idx + 2]:  # 제목+헤더 2행 offset
                cell.fill = fill
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def lifetime_row(
    no: int, name: str, birth: str, cert: str, email: str = "", phone: str = ""
) -> list:
    return [no, "평생회원", name, birth, cert, phone, email, "", ""]


def annual_row(
    no: int, name: str, birth: str, cert: str, p26: str = "", p25: str = ""
) -> list:
    return [no, "연간회원", name, birth, cert, "", "", p26, p25]


async def preview_grade(client, admin_token: str, content: bytes):
    return await client.post(
        "/api/trainees/grade-import-preview",
        files={"file": ("members.xlsx", content, XLSX_MIME)},
        cookies=admin_cookie(admin_token),
    )


async def confirm_grade(client, admin_token: str, items: list[dict]):
    return await client.post(
        "/api/trainees/grade-import-confirm",
        json={"items": items},
        cookies=admin_cookie(admin_token),
    )


async def seed_grades(db) -> dict[str, uuid.UUID]:
    """등급 마스터 시드 — seed 스크립트는 테스트 DB에서 실행되지 않는다."""
    out = {}
    for code, name in (("general", "일반"), ("lifetime", "평생"), ("annual", "연간")):
        grade = await make_grade(db, code=code, name=name, sort_order=len(out) + 1)
        out[code] = grade.id
    return out


def included_items(body: dict) -> list[dict]:
    """프리뷰 응답 → confirm 요청 items (기본 포함 행만)."""
    items = []
    for row in body["rows"]:
        if not row["default_include"]:
            continue
        items.append(
            {
                "row_number": row["row_number"],
                "trainee_id": row["trainee_id"],
                "grade_code": row["grade_kind"],
                "grade_expires_at": row["grade_expires_at"],
                "email": row["email"],
                "phone": row["phone"],
                "include": True,
            }
        )
    return items


class TestGradeImportPreview:
    async def test_separate_sheets_detects_grade_and_computes_expiry(self, client, db):
        _, admin_token = await make_admin(db)
        await db.commit()
        content = make_book(
            {
                LIFETIME_SHEET: [
                    lifetime_row(1, "평생사람", "1980.01.15", "정보시스템감리협회 제100호"),
                ],
                ANNUAL_SHEET: [
                    annual_row(1, "연간사람", "1975.06.08", "정보시스템감리협회 제200호", p26="2026.07.09"),
                    annual_row(2, "갱신사람", "1982.11.30", "정보시스템감리협회 제201호", p25="2025.05.23"),
                ],
                "(연간회원 이력확인용)": [],  # 참조 시트 — 무시돼야 한다
            }
        )

        resp = await preview_grade(client, admin_token, content)
        assert resp.status_code == 200
        body = resp.json()
        assert body["sheet_kind"] == "separate_sheets"
        assert body["summary"]["lifetime"] == 1
        assert body["summary"]["annual"] == 2

        by_name = {r["name"]: r for r in body["rows"]}
        assert by_name["평생사람"]["grade_kind"] == "lifetime"
        assert by_name["평생사람"]["grade_expires_at"] is None
        assert by_name["연간사람"]["grade_expires_at"] == "2027-07-08"  # 납부일+1년−1일
        # 25년 납부분만 있으면 최근 납부일 기준
        assert by_name["갱신사람"]["grade_expires_at"] == "2026-05-22"

    async def test_single_sheet_uses_member_type_column(self, client, db):
        _, admin_token = await make_admin(db)
        await db.commit()
        content = make_book(
            {
                "Sheet1": [
                    lifetime_row(1, "평생사람", "1980.01.15", "협회 제1호"),
                    annual_row(2, "연간사람", "1975.06.08", "협회 제2호", p26="2026.03.31"),
                ]
            }
        )

        resp = await preview_grade(client, admin_token, content)
        assert resp.status_code == 200
        body = resp.json()
        assert body["sheet_kind"] == "single_sheet"
        by_name = {r["name"]: r for r in body["rows"]}
        assert by_name["평생사람"]["grade_kind"] == "lifetime"
        assert by_name["연간사람"]["grade_kind"] == "annual"
        assert by_name["연간사람"]["grade_expires_at"] == "2027-03-30"


class TestGradeImportMatching:
    async def test_cert_match_applies_grade_with_history(self, client, db):
        grades = await seed_grades(db)
        _, trainee = await make_trainee(
            db, grades["general"], ci_raw="ci-g1", trainee_no="TR-G-1", name="김감리"
        )
        trainee.birth_date = date(1980, 1, 15)
        trainee.cert_no = "정보시스템감리협회 제100호"
        _, admin_token = await make_admin(db)
        await db.commit()

        content = make_book(
            {LIFETIME_SHEET: [lifetime_row(1, "김감리", "1980.01.15", "정보시스템감리협회 제100호")]}
        )
        resp = await preview_grade(client, admin_token, content)
        row = resp.json()["rows"][0]
        assert "CERT_MATCH" in row["categories"]
        assert row["severity"] == "info"
        assert row["trainee_current_grade"] == "general"

        confirm = await confirm_grade(client, admin_token, included_items(resp.json()))
        assert confirm.status_code == 200
        result = confirm.json()
        assert result["grade_updated"] == 1
        assert result["unchanged"] == 0

        await db.commit()
        # populate_existing — expire_on_commit=False 라 identity map 이 스태일값을 준다
        refreshed = (
            await db.execute(
                select(Trainee)
                .where(Trainee.id == trainee.id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        assert refreshed.membership_grade_id == grades["lifetime"]
        assert refreshed.grade_expires_at is None
        histories = (
            (
                await db.execute(
                    select(TraineeGradeHistory).where(
                        TraineeGradeHistory.trainee_id == trainee.id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(histories) == 1
        assert histories[0].previous_grade_id == grades["general"]
        assert histories[0].new_grade_id == grades["lifetime"]

    async def test_cert_collision_is_blocked_not_applied(self, client, db):
        """증번호는 같은데 이름·생년이 다른 사람 — 실제 오매칭 사례. 차단·제외."""
        grades = await seed_grades(db)
        _, trainee = await make_trainee(
            db, grades["general"], ci_raw="ci-g2", trainee_no="TR-G-2", name="기존사람"
        )
        trainee.birth_date = date(1953, 8, 17)
        trainee.cert_no = "서울 제334호"
        _, admin_token = await make_admin(db)
        await db.commit()

        content = make_book(
            {LIFETIME_SHEET: [lifetime_row(1, "다른사람", "1962.06.30", "서울 제334호")]}
        )
        resp = await preview_grade(client, admin_token, content)
        row = resp.json()["rows"][0]
        assert "CERT_COLLISION" in row["categories"]
        assert row["severity"] == "block"
        assert row["default_include"] is False

        # 차단 행은 기본 제외 — confirm 기본 후보가 없다
        assert included_items(resp.json()) == []

        # 제외된 행을 include=False 로 보내도 적용되지 않는다
        r = resp.json()["rows"][0]
        confirm = await confirm_grade(
            client,
            admin_token,
            [
                {
                    "row_number": r["row_number"],
                    "trainee_id": r["trainee_id"],
                    "grade_code": r["grade_kind"],
                    "grade_expires_at": r["grade_expires_at"],
                    "email": r["email"],
                    "phone": r["phone"],
                    "include": False,
                }
            ],
        )
        assert confirm.status_code == 200
        assert confirm.json()["skipped"] == 1
        assert confirm.json()["grade_updated"] == 0

        # populate_existing — expire_on_commit=False 라 identity map 이 스태일값을 준다
        after = (
            await db.execute(
                select(Trainee)
                .where(Trainee.id == trainee.id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        assert after.membership_grade_id == grades["general"]  # 무변화

    async def test_birth_near_match_warns_and_applies(self, client, db):
        """같은 이름 + 생년 자리전치(02-16 ↔ 02-18) — 경고 후 적용."""
        grades = await seed_grades(db)
        _, trainee = await make_trainee(
            db, grades["general"], ci_raw="ci-g3", trainee_no="TR-G-3", name="박종성"
        )
        trainee.birth_date = date(1972, 2, 18)
        _, admin_token = await make_admin(db)
        await db.commit()

        content = make_book(
            {LIFETIME_SHEET: [lifetime_row(1, "박종성", "1972.02.16", "협회 제900호")]}
        )
        resp = await preview_grade(client, admin_token, content)
        row = resp.json()["rows"][0]
        assert "BIRTH_NEAR_MATCH" in row["categories"]
        assert row["severity"] == "warn"
        assert row["default_include"] is True

        confirm = await confirm_grade(client, admin_token, included_items(resp.json()))
        assert confirm.json()["grade_updated"] == 1

    async def test_name_typo_suggest_matches_by_birth(self, client, db):
        """이름 전치(유중근 ↔ 유근중) + 생년 일치 — 제안 매칭."""
        grades = await seed_grades(db)
        _, trainee = await make_trainee(
            db, grades["general"], ci_raw="ci-g4", trainee_no="TR-G-4", name="유근중"
        )
        trainee.birth_date = date(1970, 4, 10)
        _, admin_token = await make_admin(db)
        await db.commit()

        content = make_book(
            {LIFETIME_SHEET: [lifetime_row(1, "유중근", "1970.04.10", "협회 제901호")]}
        )
        resp = await preview_grade(client, admin_token, content)
        row = resp.json()["rows"][0]
        assert "NAME_TYPO_SUGGEST" in row["categories"]
        assert row["trainee_id"] == str(trainee.id)

    async def test_file_duplicate_applies_once(self, client, db):
        grades = await seed_grades(db)
        _, trainee = await make_trainee(
            db, grades["general"], ci_raw="ci-g5", trainee_no="TR-G-5", name="중복사람"
        )
        trainee.birth_date = date(1985, 5, 5)
        trainee.cert_no = "협회 제500호"
        _, admin_token = await make_admin(db)
        await db.commit()

        content = make_book(
            {
                LIFETIME_SHEET: [
                    lifetime_row(1, "중복사람", "1985.05.05", "협회 제500호"),
                    lifetime_row(2, "중복사람", "1985.05.05", "협회 제500호"),
                ]
            }
        )
        resp = await preview_grade(client, admin_token, content)
        rows = resp.json()["rows"]
        assert rows[0]["default_include"] is True
        assert "FILE_DUPLICATE" in rows[1]["categories"]
        assert rows[1]["default_include"] is False

        confirm = await confirm_grade(client, admin_token, included_items(resp.json()))
        assert confirm.json()["grade_updated"] == 1

    async def test_not_found_row_is_blocked(self, client, db):
        await seed_grades(db)
        _, admin_token = await make_admin(db)
        await db.commit()

        content = make_book(
            {LIFETIME_SHEET: [lifetime_row(1, "없는사람", "1990.09.09", "협회 제999호")]}
        )
        resp = await preview_grade(client, admin_token, content)
        row = resp.json()["rows"][0]
        assert "NOT_FOUND" in row["categories"]
        assert row["severity"] == "block"
        assert row["trainee_id"] is None

    async def test_highlighted_row_excluded_by_default(self, client, db):
        """배경색 행 — 협회 '제외 대상' 표시 관행."""
        await seed_grades(db)
        _, admin_token = await make_admin(db)
        await db.commit()

        content = make_book(
            {LIFETIME_SHEET: [lifetime_row(1, "핑크사람", "1980.03.03", "협회 제700호")]},
            highlight_rows={LIFETIME_SHEET: {1}},
        )
        resp = await preview_grade(client, admin_token, content)
        row = resp.json()["rows"][0]
        assert row["is_highlighted"] is True
        assert row["default_include"] is False


class TestGradeImportConflicts:
    async def test_annual_row_for_lifetime_trainee_is_blocked(self, client, db):
        grades = await seed_grades(db)
        _, trainee = await make_trainee(
            db, grades["lifetime"], ci_raw="ci-c1", trainee_no="TR-C-1", name="평생회원"
        )
        trainee.birth_date = date(1978, 11, 23)
        trainee.cert_no = "협회 제1607호"
        _, admin_token = await make_admin(db)
        await db.commit()

        content = make_book(
            {ANNUAL_SHEET: [annual_row(1, "평생회원", "1978.11.23", "협회 제1607호", p26="2026.06.01")]}
        )
        resp = await preview_grade(client, admin_token, content)
        row = resp.json()["rows"][0]
        assert "GRADE_CONFLICT_LIFETIME" in row["categories"]
        assert row["default_include"] is False

    async def test_lifetime_row_upgrades_annual_trainee(self, client, db):
        grades = await seed_grades(db)
        _, trainee = await make_trainee(
            db, grades["annual"], ci_raw="ci-c2", trainee_no="TR-C-2", name="승격회원"
        )
        trainee.birth_date = date(1970, 2, 2)
        trainee.grade_expires_at = date(2027, 1, 1)
        _, admin_token = await make_admin(db)
        await db.commit()

        content = make_book(
            {LIFETIME_SHEET: [lifetime_row(1, "승격회원", "1970.02.02", "협회 제800호")]}
        )
        resp = await preview_grade(client, admin_token, content)
        row = resp.json()["rows"][0]
        assert "ANNUAL_UPGRADE" in row["categories"]

        confirm = await confirm_grade(client, admin_token, included_items(resp.json()))
        assert confirm.json()["grade_updated"] == 1
        await db.commit()
        # populate_existing — expire_on_commit=False 라 identity map 이 스태일값을 준다
        refreshed = (
            await db.execute(
                select(Trainee)
                .where(Trainee.id == trainee.id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        assert refreshed.membership_grade_id == grades["lifetime"]
        assert refreshed.grade_expires_at is None

    async def test_already_same_grade_counts_as_unchanged(self, client, db):
        grades = await seed_grades(db)
        _, trainee = await make_trainee(
            db, grades["lifetime"], ci_raw="ci-c3", trainee_no="TR-C-3", name="이미평생"
        )
        trainee.birth_date = date(1965, 6, 6)
        trainee.cert_no = "협회 제600호"
        _, admin_token = await make_admin(db)
        await db.commit()

        content = make_book(
            {LIFETIME_SHEET: [lifetime_row(1, "이미평생", "1965.06.06", "협회 제600호")]}
        )
        resp = await preview_grade(client, admin_token, content)
        row = resp.json()["rows"][0]
        assert "ALREADY_SAME_GRADE" in row["categories"]

        confirm = await confirm_grade(client, admin_token, included_items(resp.json()))
        assert confirm.json()["unchanged"] == 1
        await db.commit()
        histories = (
            (
                await db.execute(
                    select(TraineeGradeHistory).where(
                        TraineeGradeHistory.trainee_id == trainee.id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert histories == []  # 등급 변경 없음 — 이력 미생성

    async def test_annual_without_payment_date_is_blocked(self, client, db):
        await seed_grades(db)
        _, admin_token = await make_admin(db)
        await db.commit()

        content = make_book(
            {ANNUAL_SHEET: [annual_row(1, "미납사람", "1980.01.01", "협회 제601호")]}
        )
        resp = await preview_grade(client, admin_token, content)
        row = resp.json()["rows"][0]
        assert "NO_PAYMENT_DATE" in row["categories"]
        assert row["default_include"] is False

    async def test_future_payment_date_warns_but_includes(self, client, db):
        grades = await seed_grades(db)
        _, trainee = await make_trainee(
            db, grades["general"], ci_raw="ci-c4", trainee_no="TR-C-4", name="선납사람"
        )
        trainee.birth_date = date(1971, 4, 4)
        _, admin_token = await make_admin(db)
        await db.commit()

        content = make_book(
            {ANNUAL_SHEET: [annual_row(1, "선납사람", "1971.04.04", "협회 제602호", p26="2026.11.22")]}
        )
        resp = await preview_grade(client, admin_token, content)
        row = resp.json()["rows"][0]
        assert "FUTURE_PAYMENT" in row["categories"]
        assert row["severity"] == "warn"
        assert row["default_include"] is True


class TestGradeImportContacts:
    async def test_contacts_fill_only_empty_and_skip_invalid(self, client, db):
        grades = await seed_grades(db)
        _, empty_trainee = await make_trainee(
            db, grades["general"], ci_raw="ci-k1", trainee_no="TR-K-1", name="빈값사람"
        )
        empty_trainee.birth_date = date(1982, 2, 2)
        empty_trainee.phone_encrypted = None  # 연락처 빈 값 — 채워지는 케이스
        _, filled_trainee = await make_trainee(
            db, grades["general"], ci_raw="ci-k2", trainee_no="TR-K-2", name="기존사람"
        )
        filled_trainee.birth_date = date(1983, 3, 3)
        filled_trainee.email = "kept@naver.com"
        _, invalid_trainee = await make_trainee(
            db, grades["general"], ci_raw="ci-k3", trainee_no="TR-K-3", name="형식이상"
        )
        invalid_trainee.birth_date = date(1984, 4, 4)
        _, admin_token = await make_admin(db)
        await db.commit()

        content = make_book(
            {
                LIFETIME_SHEET: [
                    lifetime_row(
                        1, "빈값사람", "1982.02.02", "협회 제610호",
                        email="new@example.com", phone="010-1111-2222",
                    ),
                    lifetime_row(
                        2, "기존사람", "1983.03.03", "협회 제611호",
                        email="other@example.com", phone="010-3333-4444",
                    ),
                    lifetime_row(
                        3, "형식이상", "1984.04.04", "협회 제612호",
                        email="bad@ naver.com", phone="",
                    ),
                ]
            }
        )
        resp = await preview_grade(client, admin_token, content)
        # row_number 는 엑셀 실제 행(제목·헤더 2행 뒤)이라 이름으로 건진다
        rows = {r["name"]: r for r in resp.json()["rows"]}
        assert rows["빈값사람"]["email"] == "new@example.com"
        assert rows["빈값사람"]["phone"] == "01011112222"
        assert rows["기존사람"]["email"] is None
        assert "이미 등록된 이메일" in rows["기존사람"]["contact_skip_reason"]
        assert rows["형식이상"]["email"] is None
        assert "형식" in rows["형식이상"]["contact_skip_reason"]

        confirm = await confirm_grade(client, admin_token, included_items(resp.json()))
        result = confirm.json()
        assert result["grade_updated"] == 3
        assert result["contact_filled"] == 0  # 세 행 모두 등급 변경 — 연락처만 채운 행 없음

        await db.commit()
        # populate_existing — expire_on_commit=False 라 identity map 이 스태일값을 준다
        kept = (
            await db.execute(
                select(Trainee)
                .where(
                    Trainee.id.in_(
                        [empty_trainee.id, filled_trainee.id, invalid_trainee.id]
                    )
                )
                .execution_options(populate_existing=True)
            )
        ).scalars().all()
        email_by_id = {t.id: t.email for t in kept}
        assert email_by_id[empty_trainee.id] == "new@example.com"
        assert email_by_id[filled_trainee.id] == "kept@naver.com"
        assert email_by_id[invalid_trainee.id] is None



class TestGradeImportRematch:
    async def test_rematch_with_corrected_cert_finds_trainee(self, client, db):
        """증번호 정정 후 재매칭 — 협회 회신 케이스(안주혁 제2653호 등)."""
        grades = await seed_grades(db)
        _, trainee = await make_trainee(
            db, grades["general"], ci_raw="ci-r1", trainee_no="TR-R-1", name="안주혁"
        )
        trainee.birth_date = date(1972, 7, 5)
        trainee.cert_no = "정보시스템감리협회 제2653호"
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.post(
            "/api/trainees/grade-import-rematch",
            json={
                "row_number": 1,
                "name": "안주혁",
                "birth_date": "1972-07-05",
                "cert_no": "정보시스템감리협회 제2653호",
                "grade_kind": "lifetime",
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200
        row = resp.json()
        assert "CERT_MATCH" in row["categories"]
        assert row["severity"] == "info"
        assert row["trainee_id"] == str(trainee.id)
        assert row["default_include"] is True

    async def test_rematch_with_manual_expiry_clears_no_payment(self, client, db):
        """연간 납부일 없는 행에 만료일 직접 지정 — NO_PAYMENT_DATE 해제."""
        await seed_grades(db)
        _, admin_token = await make_admin(db)
        await db.commit()

        # 1) 재매칭 없이는 NO_PAYMENT_DATE 로 차단
        content = make_book(
            {ANNUAL_SHEET: [annual_row(1, "사후확인", "1980.08.08", "협회 제620호")]}
        )
        resp = await preview_grade(client, admin_token, content)
        row = resp.json()["rows"][0]
        assert "NO_PAYMENT_DATE" in row["categories"]

        # 2) 만료일 직접 지정 재매칭 — 차단 해제
        resp = await client.post(
            "/api/trainees/grade-import-rematch",
            json={
                "row_number": 1,
                "name": "사후확인",
                "birth_date": "1980-08-08",
                "cert_no": "협회 제620호",
                "grade_kind": "annual",
                "grade_expires_at": "2027-06-30",
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200
        row = resp.json()
        assert "NO_PAYMENT_DATE" not in row["categories"]
        assert row["grade_expires_at"] == "2027-06-30"

    async def test_rematch_still_not_found_stays_blocked(self, client, db):
        await seed_grades(db)
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.post(
            "/api/trainees/grade-import-rematch",
            json={
                "row_number": 1,
                "name": "그냥없는사람",
                "birth_date": "1999-09-09",
                "cert_no": "협회 제999호",
                "grade_kind": "lifetime",
            },
            cookies=admin_cookie(admin_token),
        )
        row = resp.json()
        assert "NOT_FOUND" in row["categories"]
        assert row["trainee_id"] is None
