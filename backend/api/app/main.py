import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from scalar_fastapi import get_scalar_api_reference

from app.core.config import settings
from app.domain.audit.router import router as audit_log_router
from app.domain.auth.router import (
    admin_user_router,
    allowed_email_router,
)
from app.domain.auth.router import (
    router as auth_router,
)
from app.domain.certificate.router import admin_router as certificate_admin_router
from app.domain.certificate.router import (
    pricing_router as certificate_pricing_router,
)
from app.domain.certificate.router import (
    public_router as certificate_public_router,
)
from app.domain.certificate.router import router as certificate_request_router
from app.domain.health.router import router as health_router
from app.domain.identity.router import review_router as identity_review_router
from app.domain.institution.router import course_router
from app.domain.institution.router import router as institution_router
from app.domain.me.router import router as me_router
from app.domain.payment.router import admin_router as payment_admin_router
from app.domain.payment.router import router as payment_router
from app.domain.payment.router import webhook_router as payment_webhook_router
from app.domain.trainee.router import grade_router
from app.domain.trainee.router import router as trainee_router
from app.domain.training_record.router import router as training_record_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 전역 예외 핸들러 ────────────────────────────────────────────────────────────
# Service 계층은 detail 에 {code, message} dict 를 담아 raise 하고,
# 여기서 api-design.md 형태로 언래핑해 응답한다.


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": "INTERNAL_ERROR", "message": str(exc.detail)},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    errors = [
        {"field": ".".join(str(loc) for loc in err["loc"]), "message": err["msg"]}
        for err in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "code": "VALIDATION_ERROR",
            "message": "입력값을 확인해 주세요",
            "errors": errors,
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error: %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"code": "INTERNAL_ERROR", "message": "잠시 후 다시 시도해 주세요"},
    )


# ── 라우터 등록 ────────────────────────────────────────────────────────────────
# 모든 API 는 /api 프리픽스 아래.
app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(admin_user_router, prefix="/api")
app.include_router(allowed_email_router, prefix="/api")
app.include_router(institution_router, prefix="/api")
app.include_router(course_router, prefix="/api")
app.include_router(trainee_router, prefix="/api")
app.include_router(grade_router, prefix="/api")
app.include_router(training_record_router, prefix="/api")
app.include_router(me_router, prefix="/api")
app.include_router(identity_review_router, prefix="/api")
app.include_router(audit_log_router, prefix="/api")
app.include_router(certificate_request_router, prefix="/api")
app.include_router(certificate_pricing_router, prefix="/api")
app.include_router(certificate_admin_router, prefix="/api")
app.include_router(certificate_public_router, prefix="/api")
app.include_router(payment_router, prefix="/api")
app.include_router(payment_webhook_router, prefix="/api")
app.include_router(payment_admin_router, prefix="/api")


@app.get("/scalar", include_in_schema=False)
async def scalar_docs():
    return get_scalar_api_reference(
        openapi_url=app.openapi_url, title=settings.APP_NAME
    )
