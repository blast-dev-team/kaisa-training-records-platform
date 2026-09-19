import uuid
from datetime import datetime

from pydantic import BaseModel


class SessionNameCreate(BaseModel):
    name: str


class SessionNameUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None


class SessionNameResponse(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
