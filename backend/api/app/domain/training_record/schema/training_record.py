import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class TrainingRecordCreate(BaseModel):
    """어드민 이력 등록 — 외부 수료도 동일 경로(source='external' + 증빙첨부)."""

    trainee_id: uuid.UUID
    course_id: uuid.UUID | None = None
    institution_id: uuid.UUID | None = None
    # 과정·기관 마스터 미연결 시 스냅샷 직접 입력 (최소 하나는 필수)
    course_name: str | None = None
    institution_name: str | None = None
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
    course_id: uuid.UUID | None
    institution_id: uuid.UUID | None
    course_name: str
    institution_name: str
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
