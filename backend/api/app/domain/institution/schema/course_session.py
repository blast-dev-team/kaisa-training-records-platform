import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class SessionCreate(BaseModel):
    """교육 일정 등록 — 과정의 실제 개설 회차. 등록 후 교육생을 연결해 이력을 만든다."""

    course_id: uuid.UUID
    started_at: date | None = None
    ended_at: date | None = None
    total_hours: Decimal = Decimal(0)
    recognized_hours: Decimal = Decimal(0)
    is_active: bool = True
    memo: str | None = None


class SessionUpdate(BaseModel):
    started_at: date | None = None
    ended_at: date | None = None
    total_hours: Decimal | None = None
    recognized_hours: Decimal | None = None
    is_active: bool | None = None
    memo: str | None = None


class SessionResponse(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    course_name: str
    institution_id: uuid.UUID
    institution_name: str
    schedule_no: int | None
    started_at: date | None
    ended_at: date | None
    total_hours: Decimal
    recognized_hours: Decimal
    is_active: bool
    memo: str | None
    enrolled_count: int = 0
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm(cls, s, enrolled_count: int = 0) -> "SessionResponse":
        course = s.course
        return cls(
            id=s.id,
            course_id=s.course_id,
            course_name=course.name,
            institution_id=course.institution_id,
            institution_name=course.institution.name if course.institution else "",
            schedule_no=s.schedule_no,
            started_at=s.started_at,
            ended_at=s.ended_at,
            total_hours=s.total_hours,
            recognized_hours=s.recognized_hours,
            is_active=s.is_active,
            memo=s.memo,
            enrolled_count=enrolled_count,
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
