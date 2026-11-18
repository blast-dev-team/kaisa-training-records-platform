"""스키마 공통 검증 — 시수 범위, PATCH 의 명시적 null 거부, LIKE 이스케이프.

- Hours: 시수는 0 이상, Numeric(8,2) 범위 안. 음수 시수는 외부교육 16시간 한도를
  우회할 수 있고, 범위를 넘으면 DB 가 NumericValueOutOfRange 로 500 을 낸다.
  decimal_places 는 걸지 않는다 — FE 가 보내는 float(0.1+0.2 등)를 거절하지 않도록
  자릿수는 DB(Numeric(8,2))의 반올림에 맡긴다.
- reject_explicit_null: PATCH 스키마는 exclude_unset 으로 "보낸 필드만" 반영하는데,
  NOT NULL 컬럼에 명시적 null 이 오면 IntegrityError(500) 가 났다 → 422 로 거절.
- like_contains: ILIKE 패턴에서 %, _ 를 문자 그대로 검색하도록 이스케이프.
"""

from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field

HOURS_MAX = Decimal("999999.99")  # Numeric(8,2) 상한

Hours = Annotated[Decimal, Field(ge=0, le=HOURS_MAX)]

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
