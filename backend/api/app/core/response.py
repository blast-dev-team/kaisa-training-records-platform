"""
공통 응답 스키마
- PagedResponse[T]: 페이지네이션이 있는 리스트 응답 래퍼
"""

from math import ceil

from pydantic import BaseModel, computed_field


class PagedResponse[T](BaseModel):
    """페이지네이션 리스트 응답 공통 래퍼

    Example:
        PagedResponse(items=[...], total=100, page=1, limit=20)
    """

    items: list[T]
    total: int
    page: int
    limit: int
    # 집계가 필요한 도메인만 채운다 — 전체 필터 조건 기준 합계 (현재 페이지 합이 아님)
    total_hours_sum: float | None = None

    @computed_field
    @property
    def total_pages(self) -> int:
        return max(1, ceil(self.total / self.limit))
