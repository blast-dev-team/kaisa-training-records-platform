"""테스트 공통 설정.

- TEST DATABASE(kaisa_test) 강제 — 개발/운영 DB 를 절대 건드리지 않는다.
  env 로 먼저 주입해야 settings(.env 포함) 가 테스트 값을 따르게 된다.
- 마이그레이션은 세션당 1회 alembic upgrade head (create_all 금지 — 운영과 동일 경로).
- 테스트마다 엔진 dispose + TRUNCATE — pytest-asyncio 가 테스트마다 새 이벤트 루프를
  만들므로 이전 루프에 묶인 asyncpg 커넥션을 재사용하면 죽는다.
"""

import os
import subprocess
import sys

# app import 전에 고정 — settings 는 import 시점에 환경을 읽는다
TEST_DATABASE_URL = "postgresql+asyncpg://kaisa:kaisa@localhost:5432/kaisa_test"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["CRYPTO_KEY"] = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="
os.environ.setdefault("ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("ADMIN_PASSWORD", "admin-passw0rd")
os.environ.setdefault("PORTONE_WEBHOOK_SECRET", "test-whsec")
os.environ.setdefault("PORTONE_API_SECRET", "test-api-secret")
os.environ.setdefault("PORTONE_STORE_ID", "test-store")
os.environ.setdefault("PORTONE_IDENTITY_CHANNEL_KEY", "test-channel")

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core import rate_limit
from app.core.database import Base, async_session, engine

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _run_migrations() -> None:
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=_BACKEND_DIR,
        env={**os.environ, "DATABASE_URL": TEST_DATABASE_URL},
        check=True,
        capture_output=True,
    )


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """in-memory rate limiter 상태 초기화 — 테스트 간 429 오염 방지."""
    rate_limit._attempts.clear()
    yield
    rate_limit._attempts.clear()


@pytest.fixture(scope="session", autouse=True)
def _migrate():
    _run_migrations()
    yield


@pytest.fixture
async def db():
    """전 테이블 TRUNCATE 후 session 반환. 통합 테스트 전용(autouse 아님 — 무DB 단위테스트와 분리)."""

    await engine.dispose()  # 이전 루프 커넥션 폐기
    async with async_session() as session:
        table_names = ", ".join(
            f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables)
        )
        await session.execute(
            text(f"TRUNCATE TABLE {table_names} RESTART IDENTITY CASCADE")
        )
        await session.commit()
        yield session
    await engine.dispose()


@pytest.fixture
async def client(db) -> AsyncClient:
    """앱 그대로 구동 — 엔진이 kaisa_test 를 가리키므로 override 불필요."""
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
