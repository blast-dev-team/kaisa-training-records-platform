import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.core.validation import reject_explicit_null


class SessionNameCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class SessionNameUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    is_active: bool | None = None

    @model_validator(mode="after")
    def _not_null(self):
        reject_explicit_null(self, ("name", "is_active"))
        return self


class SessionNameResponse(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
