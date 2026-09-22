import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator


class MembershipGradeCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    sort_order: int = 0
    price_krw: int = 0

    @field_validator("price_krw")
    @classmethod
    def _price_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("가격은 0원 이상이어야 해요")
        return v


class MembershipGradeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    sort_order: int | None = None
    price_krw: int | None = None
    is_active: bool | None = None

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
