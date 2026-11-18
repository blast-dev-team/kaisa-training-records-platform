"""요청 검증 오류(pydantic) → 사용자가 이해할 수 있는 한국어 메시지.

pydantic 기본 메시지("Input should be greater than or equal to 0", "Value error, ...")는
그대로 화면에 노출되면 사용자가 무엇을 고쳐야 하는지 알 수 없다. 오류 유형(type)과
필드 이름으로 "총 시수는 0 이상이어야 해요" 같은 문장을 만든다.

- 필드 라벨은 _FIELD_LABELS 에 없으면 "입력값" 으로 대체한다(필드 영문명을 노출하지 않는다).
- 스키마 validator 가 직접 쓴 한국어 문구(ValueError)는 "Value error, " 접두어만 떼고 그대로 쓴다.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any

_FIELD_LABELS: dict[str, str] = {
    # 시수
    "total_hours": "총 시수",
    "hours_total": "총 시수",
    "hours_recog": "인정 시수",
    "completed_hours": "이수 시수",
    "recognized_hours": "인정 시수",
    "max_hours": "최대 시수",
    # 기간·날짜
    "start_date": "시작일",
    "end_date": "종료일",
    "started_at": "시작일",
    "ended_at": "종료일",
    "training_started_at": "수강 시작일",
    "training_ended_at": "수강 종료일",
    "birth_date": "생년월일",
    "trainee_birth_date": "생년월일",
    "birth": "생년월일",
    "cert_issued_date": "감리원증 발급일",
    "senior_cert_issued_date": "수석감리원증 발급일",
    "completed_at": "수료일",
    "expires_at": "만료일",
    # 식별·코드
    "code": "코드",
    "course_code": "과정 코드",
    "institution_code": "기관 코드",
    "grade_code": "등급 코드",
    "cert_no": "감리원증번호",
    "senior_cert_no": "수석감리원증번호",
    "supervisor_cert_no": "감리원증번호",
    "business_registration_no": "사업자등록번호",
    # 이름·텍스트
    "name": "이름",
    "trainee_name": "교육생 이름",
    "course_name": "과정명",
    "institution_name": "기관명",
    "session_name": "회차명",
    "grade_name": "등급명",
    "title": "제목",
    "content": "내용",
    "answer": "답변",
    "memo": "메모",
    "note": "비고",
    "description": "설명",
    "reason": "사유",
    "grade_change_reason": "등급 변경 사유",
    "review_note": "심사 메모",
    "address": "주소",
    "website": "홈페이지",
    "author_name": "성명",
    "author_email": "이메일",
    "author_phone": "연락처",
    "contact_name": "담당자 이름",
    "contact_email": "담당자 이메일",
    "contact_phone": "담당자 연락처",
    "email": "이메일",
    "phone": "연락처",
    "password": "비밀번호",
    "current_password": "현재 비밀번호",
    "new_password": "새 비밀번호",
    "invite_code": "초대 코드",
    # 선택값
    "completion_status": "수료 상태",
    "institution_type": "기관 구분",
    "status": "상태",
    "role": "권한",
    "category": "분류",
    "kind": "구분",
    "source": "구분",
    "account_type": "계정 구분",
    "issue_type": "발급 구분",
    "doc_type": "문서 종류",
    "is_active": "사용 여부",
    "privacy_agreed": "개인정보 동의",
    "allow_duplicate": "중복 허용",
    # 참조
    "trainee_id": "교육생",
    "trainee_ids": "교육생",
    "course_id": "교육과정",
    "institution_id": "교육기관",
    "session_id": "일정",
    "session_name_id": "회차명",
    "membership_grade_id": "회원등급",
    "determined_grade_id": "회원등급",
    "record_ids": "교육이력",
    "training_record_ids": "교육이력",
    "certificate_ids": "증명서",
    "ids": "선택 항목",
    "items": "선택 항목",
    "file": "파일",
    # 금액·숫자
    "price_krw": "가격",
    "amount_krw": "금액",
    "sort_order": "정렬 순서",
    "page": "페이지",
    "size": "페이지 크기",
    "limit": "개수",
}

_FALLBACK_LABEL = "입력값"
# loc 의 앞부분(body/query/path) 과 배열 인덱스는 라벨 탐색에서 건너뛴다
_LOC_PREFIXES = {"body", "query", "path", "header", "cookie"}


def field_label(loc: tuple[Any, ...] | list[Any]) -> str:
    """loc 의 가장 안쪽 필드 이름으로 라벨을 찾는다 (items.0.total_hours → 총 시수)."""
    for part in reversed(list(loc)):
        if isinstance(part, int) or part in _LOC_PREFIXES:
            continue
        label = _FIELD_LABELS.get(str(part))
        if label:
            return label
    return _FALLBACK_LABEL


def _josa(word: str, with_final: str, without_final: str) -> str:
    """받침 유무에 맞는 조사 — 한글이 아니면 받침 없는 쪽을 쓴다."""
    if not word:
        return without_final
    last = word[-1]
    if "가" <= last <= "힣" and (ord(last) - 0xAC00) % 28:
        return with_final
    return without_final


def _eun(word: str) -> str:
    return word + _josa(word, "은", "는")


def _fmt_number(value: Any) -> str:
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return str(value)
    if d == d.to_integral_value():
        return f"{int(d):,}"
    return f"{d.normalize():,f}"


_VALUE_ERROR_PREFIX = re.compile(r"^(Value error|Assertion failed),\s*")


def _korean(err: dict[str, Any]) -> str:
    etype: str = err.get("type", "")
    ctx: dict[str, Any] = err.get("ctx") or {}
    label = field_label(err.get("loc", ()))
    msg: str = err.get("msg", "")

    if etype in {"value_error", "assertion_error"}:
        # 스키마 validator 가 직접 쓴 한국어 문구 — 접두어만 뗀다
        text = _VALUE_ERROR_PREFIX.sub("", msg)
        return text if re.search(r"[가-힣]", text) else f"{_eun(label)} 올바르지 않아요"
    if etype == "missing":
        return f"{_eun(label)} 필수 입력이에요"
    if etype in {"greater_than_equal", "greater_than"}:
        limit = _fmt_number(ctx.get("ge", ctx.get("gt", 0)))
        if etype == "greater_than":
            return f"{_eun(label)} {limit}보다 커야 해요"
        return f"{_eun(label)} {limit} 이상이어야 해요"
    if etype in {"less_than_equal", "less_than"}:
        limit = _fmt_number(ctx.get("le", ctx.get("lt", 0)))
        if etype == "less_than":
            return f"{_eun(label)} {limit}보다 작아야 해요"
        return f"{_eun(label)} {limit} 이하로 입력해 주세요"
    if etype in {"string_too_short", "too_short"}:
        n = ctx.get("min_length", 1)
        if etype == "string_too_short" and n <= 1:
            return f"{label}{_josa(label, '을', '를')} 입력해 주세요"
        unit = "자" if etype == "string_too_short" else "개"
        return f"{_eun(label)} {n}{unit} 이상 입력해 주세요"
    if etype in {"string_too_long", "too_long"}:
        n = ctx.get("max_length", 0)
        unit = "자" if etype == "string_too_long" else "개"
        return f"{_eun(label)} {_fmt_number(n)}{unit} 이하로 입력해 주세요"
    if etype in {"decimal_parsing", "float_parsing", "int_parsing", "decimal_type",
                 "float_type", "int_type", "int_from_float", "finite_number"}:
        return f"{_eun(label)} 숫자로 입력해 주세요"
    if etype in {"decimal_max_digits", "decimal_max_places", "decimal_whole_digits"}:
        return f"{label}의 자릿수가 너무 많아요"
    if etype in {"date_parsing", "date_from_datetime_parsing", "date_type",
                 "datetime_parsing", "datetime_from_date_parsing", "datetime_type"}:
        return f"{label} 날짜 형식이 올바르지 않아요"
    if etype in {"uuid_parsing", "uuid_type", "uuid_version"}:
        return f"{label} 선택값이 올바르지 않아요"
    if etype in {"enum", "literal_error"}:
        return f"{label} 선택값이 올바르지 않아요"
    if etype in {"bool_parsing", "bool_type"}:
        return f"{label} 값이 올바르지 않아요"
    if etype == "string_type":
        return f"{_eun(label)} 문자로 입력해 주세요"
    if etype == "string_pattern_mismatch":
        return f"{label} 형식이 올바르지 않아요"
    if etype in {"list_type", "dict_type", "model_type", "model_attributes_type"}:
        return f"{label} 형식이 올바르지 않아요"
    if etype in {"json_invalid", "json_type"}:
        return "요청 형식이 올바르지 않아요"
    if etype == "extra_forbidden":
        return "허용되지 않는 항목이 포함됐어요"
    # 이메일 등 그 밖의 유형 — 영문 원문은 노출하지 않는다
    return f"{label} 값이 올바르지 않아요"


def to_user_errors(raw_errors: list[dict[str, Any]]) -> list[dict[str, str]]:
    """RequestValidationError.errors() → [{field, message}] (message 는 한국어)."""
    out: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for err in raw_errors:
        loc = err.get("loc", ())
        # field 는 기존 계약(body.total_hours 형태)을 유지한다 — FE 가 이 경로로 입력칸을 찾는다
        field = ".".join(str(p) for p in loc)
        message = _korean(err)
        if (field, message) in seen:
            continue
        seen.add((field, message))
        out.append({"field": field, "message": message})
    return out
