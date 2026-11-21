"""스키마 공통 검증 — 시수 범위, PATCH 의 명시적 null 거부, LIKE 이스케이프.

- Hours: 시수는 0 이상, Numeric(8,2) 범위 안. 음수 시수는 외부교육 16시간 한도를
  우회할 수 있고, 범위를 넘으면 DB 가 NumericValueOutOfRange 로 500 을 낸다.
  decimal_places 는 걸지 않는다 — FE 가 보내는 float(0.1+0.2 등)를 거절하지 않도록
  자릿수는 DB(Numeric(8,2))의 반올림에 맡긴다.
- reject_explicit_null: PATCH 스키마는 exclude_unset 으로 "보낸 필드만" 반영하는데,
  NOT NULL 컬럼에 명시적 null 이 오면 IntegrityError(500) 가 났다 → 422 로 거절.
- like_contains: ILIKE 패턴에서 %, _ 를 문자 그대로 검색하도록 이스케이프.
"""

import re
import unicodedata
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, Field, StringConstraints

HOURS_MAX = Decimal("999999.99")  # Numeric(8,2) 상한

Hours = Annotated[Decimal, Field(ge=0, le=HOURS_MAX)]

# 필수 문자열 — 앞뒤 공백을 지운 뒤 비어 있으면 422. Field(min_length=1) 은 공백도 1글자로 세서
# "   " 이름·사유가 그대로 저장됐다. 길이 제한은 각 필드의 Field(max_length=…) 로 함께 건다.
NonBlankStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]

# 전화번호 — 숫자와 구분 기호(공백·하이픈·괄호·점·+)만 허용. 한글·영문이 섞인 값("010-1234-5678(집)",
# "없음")이 그대로 저장되던 문제. 저장은 숫자만(엑셀 등록·문의와 같은 형식)
_PHONE_ALLOWED = re.compile(r"[0-9\s\-+().]*")
PHONE_CHARS_MESSAGE = "전화번호는 숫자와 하이픈(-)만 입력해 주세요"
PHONE_LENGTH_MESSAGE = "전화번호는 숫자 9~11자리로 입력해 주세요"


def phone_digits(text: str) -> str:
    """구분 기호를 뺀 숫자 — +82 국제표기는 0 으로 되돌린다(+82 10-… → 010-…)."""
    digits = re.sub(r"\D", "", text)
    if text.lstrip().startswith("+82"):
        digits = "0" + digits[2:]
    return digits


def phone_format_error(value: str | None) -> str | None:
    """전화번호 형식 오류 문구 — 빈 값·정상이면 None."""
    text = unicodedata.normalize("NFKC", value or "").strip()
    if not text:
        return None
    if not _PHONE_ALLOWED.fullmatch(text):
        return PHONE_CHARS_MESSAGE
    if not 9 <= len(phone_digits(text)) <= 11:
        return PHONE_LENGTH_MESSAGE
    return None


def _phone_input(value):
    if value is None or not isinstance(value, str):
        return value
    text = unicodedata.normalize("NFKC", value).strip()
    if not text:
        return ""  # 빈 값의 의미(변경 없음·지움)는 각 서비스 규칙을 따른다
    error = phone_format_error(text)
    if error:
        raise ValueError(error)
    return phone_digits(text)


PhoneStr = Annotated[str, BeforeValidator(_phone_input)]

LIKE_ESCAPE = "\\"


def like_contains(term: str) -> str:
    """부분 일치 ILIKE 패턴 — `column.ilike(like_contains(q), escape=LIKE_ESCAPE)` 로 쓴다."""
    escaped = (
        term.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", LIKE_ESCAPE + "%")
        .replace("_", LIKE_ESCAPE + "_")
    )
    return f"%{escaped}%"


def reject_explicit_null(model: BaseModel, fields: tuple[str, ...]) -> None:
    """보낸 필드 중 NOT NULL 대상이 None 이면 ValueError — model_validator 안에서 호출."""
    sent = model.model_fields_set
    nulls = [f for f in fields if f in sent and getattr(model, f) is None]
    if nulls:
        # 영문 필드명 대신 화면 라벨로 — "총 시수는 비울 수 없어요"
        from app.core.validation_messages import field_label

        labels = list(dict.fromkeys(field_label((f,)) for f in nulls))
        raise ValueError(f"{', '.join(labels)}{_josa_eun(labels[-1])} 비울 수 없어요")


def _josa_eun(word: str) -> str:
    last = word[-1] if word else ""
    if "가" <= last <= "힣" and (ord(last) - 0xAC00) % 28:
        return "은"
    return "는"
