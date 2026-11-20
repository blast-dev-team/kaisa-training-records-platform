import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.validation import NonBlankStr, reject_explicit_null

INT32_MAX = 2**31 - 1


class MembershipGradeCreate(BaseModel):
    code: NonBlankStr = Field(max_length=50)
    name: NonBlankStr = Field(max_length=100)
    description: str | None = None
    sort_order: int = Field(default=0, ge=0, le=INT32_MAX)
    # 필수 — 기본값 0 이면 가격을 빠뜨린 등급이 무료 발급 등급이 된다 (2026-11-20)
    price_krw: int = Field(le=INT32_MAX)

    @field_validator("price_krw")
    @classmethod
    def _price_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("가격은 0원 이상이어야 해요")
        return v


class MembershipGradeUpdate(BaseModel):
    name: NonBlankStr | None = Field(default=None, max_length=100)
    description: str | None = None
    sort_order: int | None = Field(default=None, ge=0, le=INT32_MAX)
    price_krw: int | None = Field(default=None, le=INT32_MAX)
    is_active: bool | None = None

    @model_validator(mode="after")
    def _not_null(self):
        reject_explicit_null(self, ("name", "sort_order", "price_krw", "is_active"))
        return self

    @field_validator("price_krw")
    @classmethod
    def _price_non_negative(cls, v: int | None) -> int | None:
        if v is not None and v < 0:
            raise ValueError("가격은 0원 이상이어야 해요")
        return v


class MembershipGradeResponse(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    description: str | None
    sort_order: int
    price_krw: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
