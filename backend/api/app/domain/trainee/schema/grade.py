import uuid
from datetime import datetime

from pydantic import BaseModel


class MembershipGradeCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    sort_order: int = 0


class MembershipGradeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class MembershipGradeResponse(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    description: str | None
    sort_order: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
