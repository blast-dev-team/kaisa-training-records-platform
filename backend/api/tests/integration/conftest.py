"""통합 테스트 공통 — 데이터베이스가 필요한 테스트는 전부 TRUNCATE fixture 를 탄다."""

import pytest


@pytest.fixture(autouse=True)
async def _fresh_db(db):
    """root conftest 의 db(TRUNCATE) fixture 를 이 디렉터리에서 자동 적용."""
    yield
