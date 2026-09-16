from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class PublicVerificationRequest(BaseModel):
    certificate_no: str


class PublicVerificationResponse(BaseModel):
    """result 가 valid/expired/revoked 인 경우에만 확인서 정보 노출.

    not_found 는 존재 여부 누출 방지를 위해 정보 없이 동일 형태로 응답.
    이수시간·교육일은 확인서에 이미 인쇄된 정보라 공개한다.
    """

    result: str
    certificate_no: str | None = None
    issued_name_masked: str | None = None
    course_name: str | None = None
    total_hours: Decimal | None = None
    training_ended_at: date | None = None
    issued_at: date | None = None
    expires_at: date | None = None
    message: str | None = None
