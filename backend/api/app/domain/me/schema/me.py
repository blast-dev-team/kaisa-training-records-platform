import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class MeProfileResponse(BaseModel):
    """회원 포털 프로필 — user 계정 + 연결된 trainee 정보."""

    user_id: uuid.UUID
    trainee_id: uuid.UUID
    trainee_no: str | None
    name: str
    email: str | None
    phone_masked: str | None
    grade_name: str | None
    review_status: str
    last_login_at: datetime | None


class MeSessionResponse(BaseModel):
    """본인인증 세션 상태 — FE 새로고침 시 인증 상태·잔여 시간 복구용."""

    name: str
    expires_at: datetime
    # 교육생 미연결(수동 심사 대기) — WEB에서 심사 대기 화면 분기에 쓴다
    trainee_linked: bool = True
    review_pending: bool = False
    # 슈퍼 계정 — 새로고침 후에도 미리보기 모드를 유지하기 위한 플래그
    is_super: bool = False


class MyCertificateResponse(BaseModel):
    id: uuid.UUID
    certificate_no: str
    bundle_no: str | None = None
    # 문서번호 — 발급 건당 1개 (묶음 멤버 전부 동일). 재발급은 새 번호
    doc_no: str | None = None
    training_record_id: uuid.UUID
    course_name: str
    institution_name: str
    total_hours: Decimal
    completed_hours: Decimal
    training_started_at: date | None
    training_ended_at: date | None
    issue_type: str
    issued_at: datetime
    expires_at: datetime | None
    status: str

    @classmethod
    def from_orm_with_issue_type(cls, c, issue_type: str) -> "MyCertificateResponse":
        """issue_type 은 certificates 가 아닌 certificate_requests 에 있어 같이 받는다."""
        return cls(
            id=c.id,
            certificate_no=c.certificate_no,
            bundle_no=c.bundle_no,
            doc_no=c.doc_no,
            training_record_id=c.training_record_id,
            course_name=c.course_name,
            institution_name=c.institution_name,
            total_hours=c.total_hours,
            completed_hours=c.completed_hours,
            training_started_at=c.training_started_at,
            training_ended_at=c.training_ended_at,
            issue_type=issue_type,
            issued_at=c.issued_at,
            expires_at=c.expires_at,
            status=c.status,
        )


class MyCertificateRequestResponse(BaseModel):
    id: uuid.UUID
    request_no: str
    training_record_id: uuid.UUID
    course_name: str | None = None
    issue_type: str
    amount_krw: int
    status: str
    requested_at: datetime
    paid_at: datetime | None
    issued_at: datetime | None

    model_config = {"from_attributes": True}


class MyPaymentOrderResponse(BaseModel):
    id: uuid.UUID
    order_no: str
    certificate_request_id: uuid.UUID
    amount_krw: int
    status: str
    paid_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MyPaymentHistoryItem(BaseModel):
    """회원 결제 내역 — 결제완료·환불 주문만. 확인서·결제수단은 연관 데이터에서 조립."""

    id: uuid.UUID
    order_no: str
    paid_at: datetime | None
    certificate_no: str | None
    # 다건 발급 주문 — 대표 확인서 1건의 번호·교육명만 내려주고 건수로 표기
    certificate_count: int = 1
    course_name: str | None
    method: str | None
    receipt_url: str | None
    amount_krw: int
    status: str


class CertificatePriceResponse(BaseModel):
    training_record_id: uuid.UUID
    course_name: str
    issue_type: str
    grade_name: str | None
    price_krw: int
    currency: str


class DownloadUrlResponse(BaseModel):
    """교육이력 파일 다운로드 — presigned URL (FE가 blob으로 내려받는다)."""

    url: str
    file_name: str
