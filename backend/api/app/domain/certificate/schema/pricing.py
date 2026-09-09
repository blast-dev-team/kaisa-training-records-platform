import uuid
from datetime import datetime

from pydantic import BaseModel


class PricingRuleCreate(BaseModel):
    membership_grade_id: uuid.UUID
    issue_type: str = "original"
    price_krw: int
    currency: str = "KRW"
    valid_from: datetime
    valid_to: datetime | None = None
    is_active: bool = True


class PricingRuleUpdate(BaseModel):
    price_krw: int | None = None
    valid_to: datetime | None = None
    is_active: bool | None = None


class PricingRuleResponse(BaseModel):
    id: uuid.UUID
    membership_grade_id: uuid.UUID
    issue_type: str
    price_krw: int
    currency: str
    valid_from: datetime
    valid_to: datetime | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
