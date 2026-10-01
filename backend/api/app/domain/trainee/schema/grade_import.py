import uuid
from datetime import date

from pydantic import BaseModel, Field

# ── 엑셀 회원등급 일괄 적용 (협회 회원명부) ─────────────────────────────────────
#
# 기존 교육생(trainees)에 등급을 일괄 적용하는 2단계 흐름:
# preview(파싱+매칭+검증 리포트) → 모달 확인 → confirm(재검증 후 적용).
# 신규 교육생 등록은 trainee_import(엑셀 일괄 등록)가 담당한다.


class GradeImportRowResult(BaseModel):
    """리포트 1행 — 엑셀 행 + 매칭된 교육생 + 판정 결과.

    categories 는 프론트가 그룹핑·필터링하는 판정 태그 목록이고,
    severity 는 행 전체의 최악 등급(block > warn > info)이다.
    """

    row_number: int
    name: str | None = None
    birth_date: date | None = None
    cert_no: str | None = None
    grade_kind: str  # 'lifetime' | 'annual'
    grade_expires_at: date | None = None
    is_highlighted: bool = False  # 엑셀 배경색 행(협회 제외 요청 관행)
    match_mode: str = "none"  # 'cert' | 'name_birth' | 'name' | 'none'
    trainee_id: uuid.UUID | None = None
    trainee_name: str | None = None
    trainee_birth: date | None = None
    trainee_current_grade: str | None = None
    categories: list[str] = []
    severity: str = "info"  # 'block' | 'warn' | 'info'
    default_include: bool = True
    # 이 행으로 채워질 연락처 — 교육생에게 빈 값일 때만 채워진다(기존 값 보존)
    email: str | None = None
    phone: str | None = None
    contact_skip_reason: str | None = None


class GradeImportSummary(BaseModel):
    total: int = 0
    lifetime: int = 0
    annual: int = 0
    included_default: int = 0
    excluded_default: int = 0
    blocked: int = 0


class GradeImportPreviewResponse(BaseModel):
    sheet_kind: str  # 'separate_sheets' | 'single_sheet'
    rows: list[GradeImportRowResult]
    summary: GradeImportSummary
    warnings: list[str] = []


class GradeImportConfirmItem(BaseModel):
    """확정 적용 1행 — 프리뷰에서 사용자가 선택한 값.

    등급 코드·만료일은 서버에서 재검증하고, 연락처는 교육생 빈 값일 때만 반영한다.
    """

    row_number: int
    trainee_id: uuid.UUID
    grade_code: str  # 'lifetime' | 'annual'
    grade_expires_at: date | None = None
    email: str | None = None
    phone: str | None = None
    include: bool = True


class GradeImportConfirmRequest(BaseModel):
    items: list[GradeImportConfirmItem] = Field(min_length=1)


class GradeImportRematchRequest(BaseModel):
    """행 편집 후 재매칭 — 사유별로 이름·생년·증번호·만료일을 고쳐 다시 판정한다.

    연간 만료일(grade_expires_at)은 납부일 없이 직접 지정할 수 있다.
    """

    row_number: int
    name: str | None = None
    birth_date: date | None = None
    cert_no: str | None = None
    grade_kind: str  # 'lifetime' | 'annual'
    grade_expires_at: date | None = None
    email: str | None = None
    phone: str | None = None


class GradeImportFailure(BaseModel):
    row_number: int
    error: str


class GradeImportResult(BaseModel):
    """grade_updated = 등급이 실제로 바뀐 행, unchanged = 이미 같은 등급,
    contact_filled = 연락처만 채워진 행, skipped = 제외·차단 행."""

    grade_updated: int = 0
    unchanged: int = 0
    contact_filled: int = 0
    skipped: int = 0
    failed: list[GradeImportFailure] = []
