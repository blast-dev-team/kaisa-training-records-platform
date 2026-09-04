import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from scalar_fastapi import get_scalar_api_reference

from app.core.config import settings
from app.domain.health.router import router as health_router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 앱 시작/종료 시 초기화·정리 훅. (스케줄러·워밍업 등이 필요하면 여기에)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    lifespan=lifespan,
    docs_url=None,  # Swagger UI 비활성화 — Scalar(/scalar) 사용
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 라우터 등록 ────────────────────────────────────────────────────────────────
# 모든 API 는 /api 프리픽스 아래.
app.include_router(health_router, prefix="/api")


@app.get("/scalar", include_in_schema=False)
async def scalar_docs():
    return get_scalar_api_reference(openapi_url=app.openapi_url, title=settings.APP_NAME)
