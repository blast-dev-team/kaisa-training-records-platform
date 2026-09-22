from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class PublicVerificationRequest(BaseModel):
    certificate_no: str


class PublicVerificationRecordRow(BaseModel):
    """묶음 확인서의 교육이력 1행 — 확인서에 인쇄된 정보만 공개한다."""

    course_name: str
    institution_name: str | None = None
    total_hours: Decimal
    training_ended_at: date | None = None


class PublicVerificationResponse(BaseModel):
    """result 가 valid/expired/revoked 인 경우에만 확인서 정보 노출.

    not_found 는 존재 여부 누출 방지를 위해 정보 없이 동일 형태로 응답.
    이수시간·교육일은 확인서에 이미 인쇄된 정보라 공개한다.

    묶음 확인서는 records 에 전체 이력 행을 담는다. course_name 등 단건 필드는
    첫 행 값으로 유지 — 기존 소비자(구 FE)와의 호환용.
    """

    result: str
    certificate_no: str | None = None
    issued_name_masked: str | None = None
    course_name: str | None = None
    total_hours: Decimal | None = None
    training_ended_at: date | None = None
    issued_at: date | None = None
    expires_at: date | None = None
    records: list[PublicVerificationRecordRow] = []
    message: str | None = None
