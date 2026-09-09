"""공통 에러 코드 + 한국어 메시지 매핑.

Service 에서는 `raise api_error("DUPLICATE_EMAIL")` 형태로 사용한다.
HTTPException.detail 에 {code, message} dict 를 담으면 main.py 의 전역
핸들러가 언래핑해 `back/api-design.md` 응답 형태로 내려준다.
"""

from fastapi import HTTPException

# code: (http_status, 기본 한국어 메시지)
_ERRORS: dict[str, tuple[int, str]] = {
    # 공통
    "INTERNAL_ERROR": (500, "잠시 후 다시 시도해 주세요"),
    "VALIDATION_ERROR": (422, "입력값을 확인해 주세요"),
    "UNAUTHORIZED": (401, "로그인이 필요해요"),
    "SESSION_EXPIRED": (401, "세션이 만료되었어요. 다시 로그인해 주세요"),
    "FORBIDDEN": (403, "접근 권한이 없어요"),
    "NOT_FOUND": (404, "요청한 정보를 찾을 수 없어요"),
    # 인증
    "INVALID_CREDENTIALS": (401, "이메일 또는 비밀번호가 일치하지 않아요"),
    "DUPLICATE_EMAIL": (409, "이미 등록된 이메일이에요"),
    "WEAK_PASSWORD": (400, "비밀번호는 10자 이상의 영문+숫자 조합이어야 해요"),
    "EMAIL_NOT_ALLOWED": (403, "초대되지 않은 이메일이에요"),
    "ACCOUNT_DISABLED": (403, "비활성화된 계정이에요"),
    "TOO_MANY_ATTEMPTS": (429, "시도가 잦아요. 잠시 후 다시 시도해 주세요"),
    "TRAINEE_NOT_LINKED": (403, "교육생 정보가 연결되지 않았어요"),
    # 본인인증·결제
    "IDENTITY_STATE_MISMATCH": (400, "본인인증 요청이 올바르지 않아요"),
    "PAYMENT_AMOUNT_MISMATCH": (409, "결제 금액이 일치하지 않아요"),
    "WEBHOOK_SIGNATURE_INVALID": (400, "웹훅 서명이 올바르지 않아요"),
    "WEBHOOK_INVALID_PAYLOAD": (400, "웹훅 본문이 올바르지 않아요"),
    "IDENTITY_ALREADY_USED": (400, "이미 처리된 인증 요청이에요"),
    "IDENTITY_NOT_VERIFIED": (400, "본인인증이 완료되지 않았어요"),
    "IDENTITY_NO_CI": (502, "본인인증 결과에 CI 가 없어요"),
    "TRAINEE_ALREADY_LINKED": (409, "이미 다른 계정에 연결된 교육생이에요"),
    "GRADE_NOT_DETERMINED": (409, "회원등급을 확정할 수 없어요"),
    "PORTONE_NOT_CONFIGURED": (503, "결제가 설정되지 않았어요"),
    "PORTONE_INVALID_RESPONSE": (502, "결제대행사 응답이 올바르지 않아요"),
    "PAYMENT_NOT_PAID": (400, "결제가 완료되지 않았어요"),
    "PAYMENT_STORE_MISMATCH": (409, "다른 스토어의 결제예요"),
    "CERTIFICATE_ALREADY_ISSUED": (
        409,
        "이미 발급된 확인서가 있어요. 재발급으로 신청해 주세요",
    ),
    "PRICING_RULE_NOT_FOUND": (409, "적용할 가격 규칙이 없어요"),
    "INVALID_STATUS_TRANSITION": (400, "지금은 처리할 수 없는 상태예요"),
}


def api_error(
    code: str,
    *,
    status_code: int | None = None,
    message: str | None = None,
) -> HTTPException:
    """에러 코드로 HTTPException 생성. 문구·상태 재정의 가능."""
    default_status, default_message = _ERRORS.get(
        code, (500, "잠시 후 다시 시도해 주세요")
    )
    return HTTPException(
        status_code=status_code or default_status,
        detail={"code": code, "message": message or default_message},
    )
