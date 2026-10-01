"""협회 회원명부 엑셀 → 기존 교육생 회원등급 일괄 적용.

2단계 확정 게이트(preview → confirm). 파싱·매칭·검증 리포트를 만들고,
확정 시점에 DB 상태가 변했을 수 있으므로 핵심 규칙(등급 충돌·연락처 빈 값)은 다시 검증한다.

등급 분류 우선순위: 행의 `회원구분` 셀 → 시트명('평생'/'연간') → 납부일 컬럼 존재 여부.
연간 만료일은 납부일(여러 개면 최근) + 1년 − 1일 — 만료일 당일까지 유효 규칙과 일치.

매칭 폴백: 감리원증번호 전체 문자열 → (이름+생년월일) → 이름(1명일 때만).
증번호는 '정보시스템감리협회 제1234호'처럼 발급기관 접두사를 포함한 전체 문자열이
키다 — 숫자만 비교하면 서울/행안부 번호와 충돌한다(실제 오매칭 발생 사례).
"""

import io
import re
import uuid
import zipfile
from datetime import date, timedelta

import openpyxl
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.crypto import decrypt_field, name_hash
from app.core.error_codes import api_error
from app.core.kst import today_kst
from app.domain.auth.model import AdminUser
from app.domain.trainee.model import Trainee
from app.domain.trainee.repository import trainee_repository as repo
from app.domain.trainee.schema.grade_import import (
    GradeImportConfirmRequest,
    GradeImportPreviewResponse,
    GradeImportRematchRequest,
    GradeImportResult,
    GradeImportRowResult,
    GradeImportSummary,
)
from app.domain.trainee.service.trainee_service import (
    PERIOD_GRADE_CODE,
    TraineeUpdate,
    _apply_update,
    _normalize_cell_phone,
    _parse_cell_date,
)

LIFETIME = "lifetime"
ANNUAL = "annual"

GRADE_IMPORT_MAX_ROWS = 2000  # 협회 명부는 행 수가 500 을 넘는다(실측 1,087행)

_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

# 헤더 별칭 — 컬럼명이 제각각인 협회 명부 형식 대응
_HEADER_ALIASES: dict[str, tuple[str, ...]] = {
    "name": ("성명", "감리원명", "이름"),
    "birth_date": ("생년월일",),
    "cert_no": ("감리원증번호",),
    "phone": ("연락처", "전화번호", "휴대전화"),
    "email": ("e-mail", "email", "이메일"),
    "member_type": ("회원구분",),
}
_PAYMENT_KEYWORD = "납부일"

GRADE_CHANGE_REASON = "협회 회원명부 일괄 적용 (엑셀)"


def _add_year_minus_one(d: date) -> date:
    """납부일 + 1년 − 1일 — 만료일 당일까지 유효. 2/29 같은 말일은 2/28로 보정."""
    try:
        return d.replace(year=d.year + 1) - timedelta(days=1)
    except ValueError:
        return date(d.year + 1, 2, 28)


def _name_similar(a: str, b: str) -> bool:
    """이름 오타 추정 — 동일, 글자 전치(같은 구성), 1글자 차이."""
    if a == b:
        return True
    if len(a) == len(b) and sorted(a) == sorted(b):
        return True
    return len(a) == len(b) and sum(1 for x, y in zip(a, b) if x != y) == 1


def _birth_near(a: date, b: date) -> bool:
    """생년월일 오타 추정 — 동일, MMDD 자리전치, ±10일, 연도±1(월일 동일).

    수작업 검증에서 실제로 나온 패턴: 10-14↔10-04, 1963↔1964, 12-04↔12-03.
    """
    if a == b:
        return True
    if a.year == b.year and sorted(f"{a.month}{a.day}") == sorted(f"{b.month}{b.day}"):
        return True
    if abs((a - b).days) <= 10:
        return True
    return a.year in (b.year - 1, b.year + 1) and (a.month, a.day) == (b.month, b.day)


class _ParsedRow:
    """파서 내부 행 — 스키마 변환 전 중간 값."""

    __slots__ = (
        "birth_date",
        "cert_no",
        "email",
        "expires_at",
        "grade_kind",
        "is_highlighted",
        "member_type",
        "name",
        "payments",
        "phone",
        "row_number",
    )

    def __init__(self) -> None:
        self.row_number = 0
        self.name: str | None = None
        self.birth_date: date | None = None
        self.cert_no: str | None = None
        self.email: str | None = None
        self.phone: str | None = None
        self.payments: list[date] = []
        self.member_type: str | None = None
        self.grade_kind: str | None = None
        self.expires_at: date | None = None
        self.is_highlighted = False


def _cell_str(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _is_highlighted_row(cells) -> bool:
    """배경색 행 판정 — 협회는 '제외 대상'을 분홍 배경으로 표시한다.

    기본 흰 배경(theme0 tint0)과 명부 줄무늬용 거의 흰 색(RGB 채널 ≥ F0)은 무시.
    """
    for cell in cells:
        fill = cell.fill
        if fill is None or fill.patternType is None:
            continue
        fg = fill.fgColor
        if fg is None:
            continue
        if fg.type == "rgb":
            rgb = str(fg.rgb or "")
            channels = [rgb[i : i + 2] for i in (2, 4, 6)] if len(rgb) >= 8 else ["ff"] * 3
            if all(int(ch, 16) >= 0xF0 for ch in channels):
                continue
            return True
        if fg.type == "theme" and fg.theme not in (None, 0):
            return True
        if fg.type == "theme" and fg.theme == 0 and fg.tint not in (None, 0, 0.0):
            return True
    return False


def _find_header_row(rows) -> "_HeaderInfo | None":
    """헤더 행 탐지 — 명부는 상단에 제목 행이 있어 첫 행이 헤더가 아니다."""
    for idx, row in enumerate(rows[:10]):
        labels = [_cell_str(c.value) for c in row]
        header_map: dict[str, int] = {}
        for col, label in enumerate(labels):
            if not label:
                continue
            low = label.lower()
            for field, aliases in _HEADER_ALIASES.items():
                if field not in header_map and any(a == low or a in label for a in aliases):
                    header_map[field] = col
        payment_cols = [
            col for col, label in enumerate(labels) if label and _PAYMENT_KEYWORD in label
        ]
        if "name" in header_map:
            return _HeaderInfo(header_map, payment_cols, idx)
    return None


class _HeaderInfo:
    __slots__ = ("map", "payment_cols", "row_index")

    def __init__(self, map_: dict[str, int], payment_cols: list[int], row_index: int):
        self.map = map_
        self.payment_cols = payment_cols
        self.row_index = row_index


class _Verdict:
    """행 판정 누적 — 카테고리 태그와 최악 등급(severity)을 함께 관리한다."""

    __slots__ = ("categories", "default_include", "severity")

    def __init__(self) -> None:
        self.categories: list[str] = []
        self.severity = "info"
        self.default_include = True

    def info(self, cat: str) -> None:
        self.categories.append(cat)

    def warn(self, cat: str) -> None:
        self.info(cat)
        if self.severity != "block":
            self.severity = "warn"

    def block(self, cat: str) -> None:
        self.info(cat)
        self.severity = "block"
        self.default_include = False


def _resolve_grade_kind(row: _ParsedRow, sheet_kind: str | None) -> str | None:
    if row.member_type:
        if "평생" in row.member_type:
            return LIFETIME
        if "연간" in row.member_type:
            return ANNUAL
    if sheet_kind:
        return sheet_kind
    if row.payments:
        return ANNUAL
    return None


def _parse_workbook(content: bytes) -> tuple[list[_ParsedRow], str, list[str]]:
    """엑셀 → 파싱 행 목록 + 시트 구성 + 파일 단위 경고.

    모든 시트를 훑고 헤더를 찾을 수 있는 시트만 데이터로 삼는다(명부 하단 참조 시트 무시).
    """
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    except (zipfile.BadZipFile, InvalidFileException):
        raise api_error(
            "VALIDATION_ERROR",
            message="엑셀 파일(.xlsx)을 열 수 없어요. 파일을 확인해 주세요",
        )
    warnings: list[str] = []
    kinds: set[str] = set()
    parsed: list[_ParsedRow] = []

    for ws in wb.worksheets:
        sheet_kind = None
        if "평생" in ws.title:
            sheet_kind = LIFETIME
        elif "연간" in ws.title:
            sheet_kind = ANNUAL
        if sheet_kind:
            kinds.add(sheet_kind)

        rows = list(ws.iter_rows())
        header = _find_header_row(rows)
        if header is None:
            continue  # 헤더 없는 시트(이력 확인용 등)는 건너뛴다

        for cells in rows[header.row_index + 1 :]:
            row = _ParsedRow()
            row.row_number = cells[0].row
            for field, col in header.map.items():
                value = cells[col].value if col < len(cells) else None
                if field == "name":
                    row.name = _cell_str(value)
                elif field == "birth_date":
                    row.birth_date = _parse_cell_date(value)
                elif field == "cert_no":
                    row.cert_no = _cell_str(value)
                elif field == "phone":
                    row.phone = _normalize_cell_phone(value)
                elif field == "email":
                    row.email = _cell_str(value)
                elif field == "member_type":
                    row.member_type = _cell_str(value)
            for col in header.payment_cols:
                if col < len(cells):
                    paid = _parse_cell_date(cells[col].value)
                    if paid:
                        row.payments.append(paid)
            row.is_highlighted = _is_highlighted_row(cells)
            if all(
                v is None
                for v in (row.name, row.birth_date, row.cert_no, row.email, row.phone)
            ) and not row.payments:
                continue  # 완전히 빈 행
            row.grade_kind = _resolve_grade_kind(row, sheet_kind)
            parsed.append(row)
            if len(parsed) > GRADE_IMPORT_MAX_ROWS:
                raise api_error(
                    "VALIDATION_ERROR",
                    message=f"한 번에 적용할 수 있는 행은 {GRADE_IMPORT_MAX_ROWS}개까지예요",
                )
    wb.close()

    sheet_kind = "separate_sheets" if len(kinds) > 1 else "single_sheet"
    if not kinds and not any(r.grade_kind for r in parsed):
        warnings.append("시트명·회원구분으로 평생/연간을 구분하지 못해 납부일 기준으로 판정했어요")
    unclassified = [r for r in parsed if r.grade_kind is None]
    if unclassified:
        warnings.append(f"{len(unclassified)}개 행은 평생/연간을 판별할 수 없어요")
    for row in parsed:
        if row.grade_kind is None:
            row.grade_kind = ANNUAL if row.payments else LIFETIME
        if row.grade_kind == ANNUAL and row.payments:
            row.expires_at = _add_year_minus_one(max(row.payments))
    return parsed, sheet_kind, warnings


class _RowIndexes:
    """매칭 인덱스 — 증번호 전체 문자열 / (이름hash, 생년) / 이름 / 생년."""

    __slots__ = ("by_birth", "by_cert", "by_hash_birth", "by_name")

    def __init__(self, trainees: list[Trainee]) -> None:
        self.by_cert: dict[str, Trainee] = {}
        self.by_hash_birth: dict[tuple[str, date], Trainee] = {}
        self.by_name: dict[str, list[Trainee]] = {}
        self.by_birth: dict[date, list[Trainee]] = {}
        for t in trainees:
            if t.cert_no and t.cert_no.strip() not in self.by_cert:
                self.by_cert[t.cert_no.strip()] = t
            if t.birth_date:
                self.by_hash_birth.setdefault((t.name_hash, t.birth_date), t)
                self.by_birth.setdefault(t.birth_date, []).append(t)
            self.by_name.setdefault(decrypt_field(t.name_encrypted), []).append(t)


class _Evaluation:
    """_evaluate_row 결과 — 매칭 교육생 + 판정 + 채울 연락처."""

    __slots__ = ("contact_skip", "email", "match", "mode", "phone", "verdict")

    def __init__(self) -> None:
        self.match: Trainee | None = None
        self.mode = "none"
        self.verdict = _Verdict()
        self.email: str | None = None
        self.phone: str | None = None
        self.contact_skip: str | None = None


def _evaluate_row(
    row: _ParsedRow,
    indexes: _RowIndexes,
    seen_certs: set[str] | None = None,
    seen_pairs: set[tuple[str, date]] | None = None,
) -> _Evaluation:
    """행 1건 매칭·판정 — preview 와 재매칭(행 편집 후)이 공유하는 핵심.

    seen_* 는 파일 내 중복 판별용. 재매칭은 파일 맥락이 없어 None 을 넣는다.
    """
    ev = _Evaluation()
    v = ev.verdict

    if not row.name:
        v.block("MISSING_FIELD")
    if not row.birth_date:
        v.block("MISSING_FIELD")
    if row.grade_kind == ANNUAL and not row.payments and row.expires_at is None:
        v.block("NO_PAYMENT_DATE")
    if row.payments and max(row.payments) > today_kst():
        v.warn("FUTURE_PAYMENT")

    cert_key = row.cert_no.strip() if row.cert_no else None
    # 파일 내 중복 — 같은 증번호 또는 같은 이름+생년이 이미 나온 뒤면 제외.
    # 매칭 자체는 시도해 리포트에 어떤 교육생과 겹치는지 보여 준다.
    if seen_certs is not None and seen_pairs is not None and (
        (cert_key and cert_key in seen_certs)
        or (row.name and row.birth_date and (row.name, row.birth_date) in seen_pairs)
    ):
        v.block("FILE_DUPLICATE")

    if cert_key and cert_key in indexes.by_cert:
        hit = indexes.by_cert[cert_key]
        name_ok = row.name and decrypt_field(hit.name_encrypted) == row.name
        birth_ok = row.birth_date and hit.birth_date == row.birth_date
        if name_ok and birth_ok:
            ev.match, ev.mode = hit, "cert"
            v.info("CERT_MATCH")
        else:
            # 증번호는 같은데 사람이 다름 — 실제 오매칭 사례. 절대 자동 적용 금지
            v.block("CERT_COLLISION")
            ev.match, ev.mode = hit, "cert"
    elif row.name and row.birth_date:
        hit = indexes.by_hash_birth.get((name_hash(row.name), row.birth_date))
        if hit is not None:
            ev.match, ev.mode = hit, "name_birth"
            v.info("NAME_BIRTH_MATCH")
        else:
            near = indexes.by_name.get(row.name, [])
            near = [
                t
                for t in near
                if t.birth_date and _birth_near(row.birth_date, t.birth_date)
            ]
            if len(near) == 1:
                ev.match, ev.mode = near[0], "name_birth"
                v.warn("BIRTH_NEAR_MATCH")
            elif len(near) > 1:
                v.block("AMBIGUOUS_NAME")
            else:
                typo = [
                    t
                    for t in indexes.by_birth.get(row.birth_date, [])
                    if _name_similar(row.name, decrypt_field(t.name_encrypted))
                ]
                if len(typo) == 1:
                    ev.match, ev.mode = typo[0], "name_birth"
                    v.warn("NAME_TYPO_SUGGEST")
                elif len(typo) > 1:
                    v.block("AMBIGUOUS_NAME")
    elif row.name:
        hits = indexes.by_name.get(row.name, [])
        if len(hits) == 1:
            ev.match, ev.mode = hits[0], "name"
            v.warn("NAME_ONLY_MATCH")
        elif len(hits) > 1:
            v.block("AMBIGUOUS_NAME")

    if ev.match is None:
        v.block("NOT_FOUND")

    if ev.match is not None and "CERT_COLLISION" not in v.categories:
        # 충돌 행의 match 는 '잘못 물린 다른 사람'이라 등급 비교 카테고리를 붙이지
        # 않는다 — 붙이면 충돌 상대 기준의 '이미 적용됨'이 같이 떠 오해를 낳는다.
        current_code = ev.match.grade.code if ev.match.grade else None
        if current_code == row.grade_kind and (
            row.grade_kind == LIFETIME or ev.match.grade_expires_at == row.expires_at
        ):
            v.info("ALREADY_SAME_GRADE")
        if row.grade_kind == ANNUAL and current_code == LIFETIME:
            v.block("GRADE_CONFLICT_LIFETIME")
        if row.grade_kind == LIFETIME and current_code == ANNUAL:
            v.info("ANNUAL_UPGRADE")
        if ev.mode != "cert" and cert_key and (ev.match.cert_no or "").strip() != cert_key:
            v.info("CERT_NO_MISMATCH_INFO")

        # 연락처 — 교육생 빈 값만. 이미 있으면 스킵 사유를 내려준다
        if row.email:
            if ev.match.email:
                ev.contact_skip = "시스템에 이미 등록된 이메일이 있어요"
            elif _EMAIL_RE.match(row.email):
                ev.email = row.email
            else:
                ev.contact_skip = "이메일 형식이 올바르지 않아요"
        if row.phone:
            if ev.match.phone_encrypted:
                ev.contact_skip = ev.contact_skip or "시스템에 이미 등록된 전화번호가 있어요"
            else:
                ev.phone = row.phone

    return ev


async def preview_grade_import(
    db: AsyncSession, content: bytes
) -> GradeImportPreviewResponse:
    parsed, sheet_kind, warnings = _parse_workbook(content)
    if not parsed:
        raise api_error("VALIDATION_ERROR", message="엑셀에 적용할 행이 없어요")

    # 후보 벌크 조회 — 증번호·이름 일치 + (이름 오타 제안용) 생년월일 일치
    cert_nos = [r.cert_no for r in parsed if r.cert_no]
    names = [r.name for r in parsed if r.name]
    candidates = await repo.find_by_identifiers(db, names, cert_nos, [])
    births = {r.birth_date for r in parsed if r.birth_date}
    candidates += await repo.find_by_birth_dates(db, list(births))
    seen_ids: set[uuid.UUID] = set()
    unique: list[Trainee] = []
    for t in candidates:
        if t.id not in seen_ids:
            seen_ids.add(t.id)
            unique.append(t)
    indexes = _RowIndexes(unique)

    results: list[GradeImportRowResult] = []
    seen_certs: set[str] = set()
    seen_pairs: set[tuple[str, date]] = set()
    blocked = excluded = 0

    for row in parsed:
        ev = _evaluate_row(row, indexes, seen_certs, seen_pairs)
        match, v = ev.match, ev.verdict

        cert_key = row.cert_no.strip() if row.cert_no else None
        if cert_key:
            seen_certs.add(cert_key)
        if row.name and row.birth_date:
            seen_pairs.add((row.name, row.birth_date))

        if v.severity == "block":
            blocked += 1
        if not v.default_include:
            excluded += 1

        results.append(
            GradeImportRowResult(
                row_number=row.row_number,
                name=row.name,
                birth_date=row.birth_date,
                cert_no=row.cert_no,
                grade_kind=row.grade_kind,
                grade_expires_at=row.expires_at,
                is_highlighted=row.is_highlighted,
                match_mode=ev.mode,
                trainee_id=match.id if match else None,
                trainee_name=decrypt_field(match.name_encrypted) if match else None,
                trainee_birth=match.birth_date if match else None,
                trainee_current_grade=match.grade.code if match and match.grade else None,
                categories=v.categories,
                severity=v.severity,
                default_include=v.default_include,
                email=ev.email,
                phone=ev.phone,
                contact_skip_reason=ev.contact_skip,
            )
        )

    lifetime = sum(1 for r in results if r.grade_kind == LIFETIME)
    summary = GradeImportSummary(
        total=len(results),
        lifetime=lifetime,
        annual=len(results) - lifetime,
        included_default=len(results) - excluded,
        excluded_default=excluded,
        blocked=blocked,
    )
    return GradeImportPreviewResponse(
        sheet_kind=sheet_kind, rows=results, summary=summary, warnings=warnings
    )


async def rematch_grade_import_row(
    db: AsyncSession, data: "GradeImportRematchRequest"
) -> GradeImportRowResult:
    """행 편집 후 재매칭 — 사유(CERT_COLLISION·NOT_FOUND 등)별로 값을 고쳐 다시 판정한다.

    preview 와 같은 _evaluate_row 를 쓰지만 파일 내 중복 맥락은 없다.
    연간 만료일은 납부일이 없어도 직접 지정할 수 있다(협회 사후 확인 케이스).
    """
    row = _ParsedRow()
    row.row_number = data.row_number
    row.name = data.name
    row.birth_date = data.birth_date
    row.cert_no = data.cert_no
    row.email = data.email
    row.phone = _normalize_cell_phone(data.phone)
    row.grade_kind = data.grade_kind
    row.expires_at = data.grade_expires_at
    if row.grade_kind == ANNUAL and row.expires_at is None and row.payments:
        row.expires_at = _add_year_minus_one(max(row.payments))

    candidates = await repo.find_by_identifiers(
        db,
        [row.name] if row.name else [],
        [row.cert_no] if row.cert_no else [],
        [],
    )
    if row.birth_date:
        candidates += await repo.find_by_birth_dates(db, [row.birth_date])
    indexes = _RowIndexes(candidates)

    ev = _evaluate_row(row, indexes)
    match, v = ev.match, ev.verdict
    return GradeImportRowResult(
        row_number=row.row_number,
        name=row.name,
        birth_date=row.birth_date,
        cert_no=row.cert_no,
        grade_kind=row.grade_kind,
        grade_expires_at=row.expires_at,
        match_mode=ev.mode,
        trainee_id=match.id if match else None,
        trainee_name=decrypt_field(match.name_encrypted) if match else None,
        trainee_birth=match.birth_date if match else None,
        trainee_current_grade=match.grade.code if match and match.grade else None,
        categories=v.categories,
        severity=v.severity,
        default_include=v.default_include,
        email=ev.email,
        phone=ev.phone,
        contact_skip_reason=ev.contact_skip,
    )


async def confirm_grade_import(
    db: AsyncSession, data: GradeImportConfirmRequest, actor: AdminUser
) -> GradeImportResult:
    """리포트에서 선택된 행만 적용 — 등급 충돌·연락처 빈 값은 확정 시점에 재검증한다.

    프리뷰 이후 다른 관리자가 교육생을 수정했을 수 있으므로 등급 id·만료일 규칙·
    연락처 공백 여부를 서버가 다시 판정한다. commit 은 1회.
    """
    grade_ids: dict[str, uuid.UUID] = {}
    for code in (LIFETIME, PERIOD_GRADE_CODE):
        grade = await repo.find_grade_by_code(db, code)
        if grade is not None:
            grade_ids[code] = grade.id

    trainees = await repo.find_by_ids(db, [i.trainee_id for i in data.items])
    by_id = {t.id: t for t in trainees}

    result = GradeImportResult()
    changed_any = False
    for item in data.items:
        if not item.include or item.grade_code not in grade_ids:
            result.skipped += 1
            continue
        trainee = by_id.get(item.trainee_id)
        if trainee is None:
            result.failed.append(
                {"row_number": item.row_number, "error": "교육생을 찾을 수 없어요"}
            )
            continue

        grade_id = grade_ids[item.grade_code]
        expires = item.grade_expires_at if item.grade_code == ANNUAL else None
        if item.grade_code == ANNUAL and expires is None:
            result.failed.append(
                {"row_number": item.row_number, "error": "연간 회원은 만료일이 필요해요"}
            )
            continue
        if item.grade_code == ANNUAL and trainee.membership_grade_id == grade_ids[LIFETIME]:
            # 평생 → 연간 강등 금지 (프리뷰 BLOCK 재확인)
            result.skipped += 1
            continue

        grade_was_same = (
            trainee.membership_grade_id == grade_id
            and (trainee.grade_expires_at or None) == (expires or None)
        )

        update_data: dict = {
            "membership_grade_id": grade_id,
            "grade_expires_at": expires,
            "grade_change_reason": GRADE_CHANGE_REASON,
        }
        # 연락처 — 확정 시점에도 빈 값일 때만
        contact_applied = False
        if item.email and not trainee.email:
            update_data["email"] = item.email
            contact_applied = True
        if item.phone and not trainee.phone_encrypted:
            update_data["phone"] = item.phone
            contact_applied = True

        if grade_was_same and not contact_applied:
            result.unchanged += 1
            continue

        await _apply_update(db, trainee, TraineeUpdate(**update_data), actor)
        changed_any = True
        if grade_was_same:
            result.contact_filled += 1
        else:
            result.grade_updated += 1

    record_audit(
        db,
        actor_admin_id=actor.id,
        action="trainee.grade_import",
        entity_type="trainee",
        after={
            "grade_updated": result.grade_updated,
            "unchanged": result.unchanged,
            "contact_filled": result.contact_filled,
            "skipped": result.skipped,
            "failed": len(result.failed),
        },
    )
    if changed_any:
        await db.commit()
    return result
