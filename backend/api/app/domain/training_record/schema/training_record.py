import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.core.crypto import decrypt_field, mask_phone


class TrainingRecordCreate(BaseModel):
    """어드민 이력 등록 — 외부 수료도 동일 경로(source='external' + 증빙첨부)."""

    trainee_id: uuid.UUID
    course_id: uuid.UUID | None = None
    institution_id: uuid.UUID | None = None
    # 과정·기관 마스터 미연결 시 스냅샷 직접 입력 (최소 하나는 필수)
    course_name: str | None = None
    institution_name: str | None = None
    # 확인서 표기용 — 서식번호·문서번호·감리원 등급·감리원증 발급번호
    form_no: str | None = None
    doc_no: str | None = None
    supervisor_grade: str | None = None
    supervisor_cert_no: str | None = None
    total_hours: Decimal | None = None  # 미지정 시 과정 마스터 값
    completed_hours: Decimal = Decimal(0)
    started_at: date | None = None
    ended_at: date | None = None
    source: str = "internal"  # internal | external | legacy_import
    evidence_file_key: str | None = None
    completion_status: str = "completed"  # in_progress | completed | canceled
    memo: str | None = None


class TrainingRecordUpdate(BaseModel):
    course_id: uuid.UUID | None = None
    institution_id: uuid.UUID | None = None
    form_no: str | None = None
    doc_no: str | None = None
    supervisor_grade: str | None = None
    supervisor_cert_no: str | None = None
    total_hours: Decimal | None = None
    completed_hours: Decimal | None = None
    started_at: date | None = None
    ended_at: date | None = None
    evidence_file_key: str | None = None
    completion_status: str | None = None
    memo: str | None = None


class TrainingRecordResponse(BaseModel):
    id: uuid.UUID
    training_record_no: str
    trainee_id: uuid.UUID
    # 어드민 목록 표시용 — trainee 조인 값 (model_validate 로는 안 채워진다)
    trainee_name: str | None = None
    trainee_no: str | None = None
    trainee_cert_no: str | None = None  # 감리원증번호 — 목록 표시용
    trainee_birth_date: date | None = None
    trainee_phone: str | None = None  # 마스킹 — trainee.phone_encrypted 복호화 후 mask_phone
    course_id: uuid.UUID | None
    session_id: uuid.UUID | None = None
    institution_id: uuid.UUID | None
    course_name: str
    institution_name: str
    form_no: str | None
    doc_no: str | None
    supervisor_grade: str | None
    supervisor_cert_no: str | None
    total_hours: Decimal
    completed_hours: Decimal
    started_at: date | None
    ended_at: date | None
    source: str
    evidence_file_key: str | None
    completion_status: str
    completed_at: datetime | None
    memo: str | None
    created_at: datetime
    updated_at: datetime
    # 회원 포털 전용 — 어드민 응답에서는 None. 유저별 발급 상태는 certificates 에서 산출
    # (데모 이력은 여러 회원이 공유하므로 training_records 에 발급 상태를 둘 수 없다)
    certificate_status: str | None = None  # issuable | reissuable | unavailable
    last_issued_at: datetime | None = None
    reissue_free_until: datetime | None = None  # 7일 무료 재발급 기한

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, record) -> "TrainingRecordResponse":
        trainee = record.trainee
        phone = (
            mask_phone(decrypt_field(trainee.phone_encrypted))
            if trainee and trainee.phone_encrypted
            else None
        )
        return cls(
            id=record.id,
            training_record_no=record.training_record_no,
            trainee_id=record.trainee_id,
            trainee_name=trainee.name if trainee else None,
            trainee_no=trainee.trainee_no if trainee else None,
            trainee_cert_no=trainee.cert_no if trainee else None,
            trainee_birth_date=trainee.birth_date if trainee else None,
            trainee_phone=phone,
            course_id=record.course_id,
            session_id=record.session_id,
            institution_id=record.institution_id,
            course_name=record.course_name,
            institution_name=record.institution_name,
            form_no=record.form_no,
            doc_no=record.doc_no,
            supervisor_grade=record.supervisor_grade,
            supervisor_cert_no=record.supervisor_cert_no,
            total_hours=record.total_hours,
            completed_hours=record.completed_hours,
            started_at=record.started_at,
            ended_at=record.ended_at,
            source=record.source,
            evidence_file_key=record.evidence_file_key,
            completion_status=record.completion_status,
            completed_at=record.completed_at,
            memo=record.memo,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )


class TrainingRecordBulkCreate(BaseModel):
    """일정 → 교육생 일괄 연결 — 연결된 교육생 수만큼 이력 생성. 중복 연결은 건너뜀."""

    session_id: uuid.UUID
    trainee_ids: list[uuid.UUID]
    completed_hours: Decimal | None = None  # 미지정 시 일정 인정시간
    completion_status: str = "completed"
    memo: str | None = None


class TrainingRecordBulkUpdateItem(BaseModel):
    """일괄 수정 1행 — 전달된 필드만 바꾼다(exclude_unset). null 은 값을 지운다."""

    id: uuid.UUID
    course_id: uuid.UUID | None = None
    form_no: str | None = None
    doc_no: str | None = None
    completion_status: str | None = None
    started_at: date | None = None
    ended_at: date | None = None
    total_hours: Decimal | None = None
    completed_hours: Decimal | None = None


class TrainingRecordBulkUpdate(BaseModel):
    updates: list[TrainingRecordBulkUpdateItem] = Field(min_length=1)


class TrainingRecordBulkDelete(BaseModel):
    """선택 이력 일괄 삭제 — 소프트딜리트라 감사로그·발급 이력은 보존된다."""

    ids: list[uuid.UUID] = Field(min_length=1)


class TrainingRecordBulkResult(BaseModel):
    created: int
    skipped: int


class MatchPreviewMatched(BaseModel):
    """엑셀 행과 대조가 끝난 교육생 — 연결(이력 생성) 전 자동 선택용."""

    trainee_id: uuid.UUID
    name: str
    trainee_no: str | None = None
    cert_no: str | None = None
    matched_by: str  # cert_no | trainee_no | name


class MatchPreviewUnmatched(BaseModel):
    row_number: int
    name: str | None = None
    # 엑셀에 있었지만 대조에 실패한 값 — 직접 등록으로 신규 교육생을 만들 때 재사용
    cert_no: str | None = None
    reason: str


class TraineeMatchPreviewResult(BaseModel):
    total_rows: int
    matched: list[MatchPreviewMatched]
    unmatched: list[MatchPreviewUnmatched]
