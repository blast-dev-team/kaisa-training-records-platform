from datetime import date

from pydantic import BaseModel


class PublicVerificationRequest(BaseModel):
    certificate_no: str
    issue_date: date  # 확인서에 적힌 발급일 (YYYY-MM-DD)


class PublicVerificationResponse(BaseModel):
    """result 가 valid/expired/revoked 인 경우에만 확인서 정보 노출.

    not_found/mismatch 는 존재 여부 누출 방지를 위해 정보 없이 동일 형태로 응답.
    """

    result: str
    certificate_no: str | None = None
    issued_name_masked: str | None = None
    course_name: str | None = None
    issued_at: date | None = None
    expires_at: date | None = None
    message: str | None = None
