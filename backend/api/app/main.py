import asyncio
import logging
import uuid
from contextlib import asynccontextmanager, suppress

import sentry_sdk
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from scalar_fastapi import get_scalar_api_reference

from app.core.config import settings
from app.core.scheduler import run_daily_task
from app.domain.audit.router import router as audit_log_router
from app.domain.auth.router import (
    admin_user_router,
    allowed_email_router,
)
from app.domain.auth.router import (
    router as auth_router,
)
from app.domain.certificate.router import (
    admin_router as certificate_admin_router,
)
from app.domain.certificate.router import (
    completion_router as completion_certificate_router,
)
from app.domain.certificate.router import (
    public_router as certificate_public_router,
)
from app.domain.certificate.router import router as certificate_request_router
from app.domain.health.router import router as health_router
from app.domain.identity.router import review_router as identity_review_router
from app.domain.inquiry.router import admin_router as inquiry_admin_router
from app.domain.inquiry.router import member_router as inquiry_member_router
from app.domain.inquiry.router import public_router as inquiry_public_router
from app.domain.institution.router import (
    course_router,
    session_name_router,
    session_router,
)
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

# ── Sentry ─────────────────────────────────────────────────────────────────────
# DSN 비면 비활성화 (로컬 기본). 환경 태그는 ENVIRONMENT(local|staging|production),
# 릴리즈는 RELEASE. 개인정보 처리 시스템이라 쿠키·헤더 PII 전송은 끈다.
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        release=settings.RELEASE or None,
        send_default_pii=False,
        traces_sample_rate=0.1,
    )

# ── Sentry 기능 태그 ────────────────────────────────────────────────────────────
# 요청 경로 앞부분으로 기능을 묶는다 — 이슈 필터 "feature:결제" 처럼 쓴다.
_FEATURE_PREFIXES = [
    ("/api/payments", "결제"),
    ("/api/payment-orders", "결제"),
    ("/api/certificate-requests", "확인서"),
    ("/api/certificates", "확인서"),
    ("/api/completion-certificates", "확인서"),
    ("/api/training-records", "교육내역"),
    ("/api/inquiries", "문의"),
    ("/api/public/inquiries", "문의"),
    ("/api/identity-reviews", "본인인증심사"),
    ("/api/trainees", "교육생"),
    ("/api/courses", "교육과정"),
    ("/api/course-sessions", "교육과정"),
    ("/api/session-names", "교육과정"),
    ("/api/institutions", "기관"),
    ("/api/membership-grades", "회원등급"),
    ("/api/admin-users", "관리자계정"),
    ("/api/audit-logs", "감사로그"),
    ("/api/auth", "인증"),
    ("/api/me", "내정보"),
    ("/api/public", "공개조회"),
]


def _sentry_feature(path: str) -> str:
    for prefix, name in _FEATURE_PREFIXES:
        if path.startswith(prefix):
            return name
    return path


logger = logging.getLogger(__name__)


async def membership_expiry_job() -> None:
    """연간 회원 만료 자동 일반 전환 — 일일 스케줄러가 매일 KST 09:00 실행한다."""
    from app.core.database import async_session
    from app.domain.trainee.service import trainee_service

    async with async_session() as db:
        count = await trainee_service.expire_due_memberships(db)
    if count:
        logger.info("연간 만료 자동 일반 전환 %s건", count)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 앱 시작/종료 시 초기화·정리 훅.
    # 일일 스케줄러 — 연간 회원 만료 자동 일반 전환 (트래픽 없는 날에도 전환 보장).
    # workers=1 고정이라 인프로세스 태스크로 충분 (app/core/scheduler.py 참고)
    scheduler_task = asyncio.create_task(
        run_daily_task(
            hour=0,
            minute=0,
            name="membership_expiry_transition",
            job=membership_expiry_job,
        )
    )
    try:
        yield
    finally:
        scheduler_task.cancel()
        with suppress(asyncio.CancelledError):
            await scheduler_task


app = FastAPI(
    title=settings.APP_NAME,
    lifespan=lifespan,
    docs_url=None,  # Swagger UI 비활성화 — Scalar(/scalar) 사용
    redoc_url=None,
    # 프로덕션에선 API 스키마 자체를 노출하지 않는다 — 공격자 정찰 자료가 된다
    openapi_url=None if settings.ENVIRONMENT == "production" else "/openapi.json",
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
    # 커스텀 핸들러가 예외를 삼켜 Sentry ASGI 통합에 안 걸리므로 여기서 명시 수집.
    # 어떤 기능·엔드포인트에서, 어떤 요청 본문으로 터졌는지 이슈에 붙인다.
    sentry_sdk.set_tag("endpoint", f"{request.method} {request.url.path}")
    sentry_sdk.set_tag("feature", _sentry_feature(request.url.path))
    try:
        raw_body = await request.body()
        if raw_body:
            sentry_sdk.set_extra(
                "request_body", raw_body[:2000].decode("utf-8", errors="replace")
            )
    except Exception:
        # 컨텍스트 수집 실패가 500 응답을 막지 않게
        logger.debug("sentry request context 수집 실패", exc_info=True)
    sentry_sdk.capture_exception(exc)
    # 화면에 보인 오류 코드로 서버 로그의 traceback 을 바로 찾을 수 있게 같은 id 를 남긴다
    error_id = uuid.uuid4().hex[:8]
    logger.exception(
        "Unhandled error [%s]: %s %s", error_id, request.method, request.url.path
    )
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_ERROR",
            "message": f"잠시 후 다시 시도해 주세요 (오류 코드: {error_id})",
            "error_id": error_id,
        },
    )


# ── 라우터 등록 ────────────────────────────────────────────────────────────────
# 모든 API 는 /api 프리픽스 아래.
app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(admin_user_router, prefix="/api")
app.include_router(allowed_email_router, prefix="/api")
app.include_router(institution_router, prefix="/api")
app.include_router(course_router, prefix="/api")
app.include_router(session_router, prefix="/api")
app.include_router(session_name_router, prefix="/api")
app.include_router(trainee_router, prefix="/api")
app.include_router(grade_router, prefix="/api")
app.include_router(training_record_router, prefix="/api")
app.include_router(me_router, prefix="/api")
app.include_router(identity_review_router, prefix="/api")
app.include_router(audit_log_router, prefix="/api")
app.include_router(certificate_request_router, prefix="/api")
app.include_router(certificate_admin_router, prefix="/api")
app.include_router(certificate_public_router, prefix="/api")
app.include_router(completion_certificate_router, prefix="/api")
app.include_router(payment_router, prefix="/api")
app.include_router(payment_webhook_router, prefix="/api")
app.include_router(payment_admin_router, prefix="/api")
app.include_router(inquiry_member_router, prefix="/api")
app.include_router(inquiry_public_router, prefix="/api")
app.include_router(inquiry_admin_router, prefix="/api")


if settings.ENVIRONMENT != "production":

    @app.get("/scalar", include_in_schema=False)
    async def scalar_docs():
        return get_scalar_api_reference(
            openapi_url=app.openapi_url, title=settings.APP_NAME
        )
