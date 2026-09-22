import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field

from app.core.crypto import decrypt_field, mask_phone


class TraineeResponse(BaseModel):
    """전화는 복호화 후 마스킹해 내려준다 (원문 미노출)."""

    id: uuid.UUID
    trainee_no: str | None
    cert_no: str | None
    supervisor_grade: str | None
    cert_issued_date: date | None
    name: str
    birth_date: date | None
    phone_masked: str | None
    email: EmailStr | None
    review_status: str
    membership_grade_id: uuid.UUID | None
    grade_name: str | None
    grade_expires_at: date | None
    user_id: uuid.UUID | None
    memo: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm(cls, t) -> "TraineeResponse":
        phone = (
            mask_phone(decrypt_field(t.phone_encrypted)) if t.phone_encrypted else None
        )
        return cls(
            id=t.id,
            trainee_no=t.trainee_no,
            cert_no=t.cert_no,
            supervisor_grade=t.supervisor_grade,
            cert_issued_date=t.cert_issued_date,
            name=t.name,
            birth_date=t.birth_date,
            phone_masked=phone,
            email=t.email,
            review_status=t.review_status,
            membership_grade_id=t.membership_grade_id,
            grade_name=t.grade.name if t.grade else None,
            grade_expires_at=t.grade_expires_at,
            user_id=t.user_id,
            memo=t.memo,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )


class TraineeCreate(BaseModel):
    """어드민 수기 등록 — 신원을 어드민이 직접 확인했음을 전제로 approved 로 들어간다."""

    name: str
    cert_no: str | None = None  # 감리원증번호
    supervisor_grade: str | None = None  # 감리원 등급 (감리원/수석감리원)
    cert_issued_date: date | None = None  # 감리원증 발급일자
    birth_date: date | None = None
    phone: str | None = None  # 평문 수신 → 암호화 저장
    email: EmailStr | None = None
    memo: str | None = None
    membership_grade_id: uuid.UUID | None = None
    # 연간 등급 지정 시 만료일 필수(서버 검증), 그 외 등급은 NULL
    grade_expires_at: date | None = None


class TraineeUpdate(BaseModel):
    """review_status 는 본인인증 심사(identity) 플로우에서만 변경 — 여기서 다루지 않는다."""

    name: str | None = None
    cert_no: str | None = None  # 감리원증번호
    supervisor_grade: str | None = None  # 감리원 등급
    cert_issued_date: date | None = None  # 감리원증 발급일자
    birth_date: date | None = None
    phone: str | None = None  # 평문 수신 → 암호화 저장
    email: EmailStr | None = None
    memo: str | None = None
    membership_grade_id: uuid.UUID | None = None
    # 연간 등급 만료일 — 연간 지정/연장 시 필수, 다른 등급으로 바꾸면 서버가 NULL 처리
    grade_expires_at: date | None = None
    grade_change_reason: str | None = None  # 등급 변경 시 사유 (history 기록용)


class TraineeBulkUpdateItem(BaseModel):
    """일괄 수정 1건. 키를 보내지 않으면 그 필드는 변경 없음."""

    id: uuid.UUID
    name: str | None = None
    birth_date: date | None = None
    phone: str | None = None  # 평문 수신 → 암호화 저장. 빈 문자열 = 변경 없음
    cert_no: str | None = None  # 감리원증번호. 빈 문자열 = 변경 없음


class TraineeBulkGradeCreate(BaseModel):
    """선택 교육생 회원등급 일괄 변경 — 사유 없이 바로 변경 (history 사유 None)."""

    trainee_ids: list[uuid.UUID] = Field(min_length=1)
    membership_grade_id: uuid.UUID
    # 연간 선택 시 만료일(전원 동일 적용) — 없으면 400
    grade_expires_at: date | None = None


class TraineeBulkUpdate(BaseModel):
    items: list[TraineeBulkUpdateItem] = Field(min_length=1)


class TraineeBulkResult(BaseModel):
    """skipped = 없는/삭제된 id, 이미 같은 등급, 변경 필드 없는 item."""

    updated: int = 0
    skipped: int = 0


# ── 엑셀 일괄 등록 ─────────────────────────────────────────────────────────────


class TraineeImportRow(BaseModel):
    """엑셀 프리뷰 1행 — 파싱·검증·중복 판별 결과. errors 가 비어 있어야 등록 대상."""

    row_number: int
    name: str | None = None
    phone: str | None = None  # 숫자 정규화된 평문 (프리뷰 편집용)
    birth_date: date | None = None
    cert_no: str | None = None
    supervisor_grade: str | None = None
    cert_issued_date: date | None = None
    is_duplicate: bool = False
    duplicate_of_name: str | None = None
    errors: list[str] = []


class TraineeImportPreviewResponse(BaseModel):
    rows: list[TraineeImportRow]
    total: int


class TraineeImportConfirmItem(BaseModel):
    """확정 등록 1행 — 프리뷰에서 사용자가 편집한 값."""

    row_number: int
    name: str
    phone: str | None = None
    birth_date: date | None = None
    cert_no: str | None = None
    supervisor_grade: str | None = None
    cert_issued_date: date | None = None


class TraineeImportConfirmRequest(BaseModel):
    items: list[TraineeImportConfirmItem] = Field(min_length=1)


class TraineeImportFailure(BaseModel):
    row_number: int
    error: str


class TraineeImportResult(BaseModel):
    """skipped = 확정 시점 재판정에서 중복으로 걸러진 행."""

    created: int = 0
    skipped: int = 0
    failed: list[TraineeImportFailure] = []
