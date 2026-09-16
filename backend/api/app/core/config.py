import json
import logging
import os

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


def _load_aws_secrets_into_env() -> None:
    """AWS_SECRETS_NAME이 설정된 경우에만 Secrets Manager 값을 os.environ으로 주입.

    - AWS_SECRETS_NAME 미설정 시 no-op (.env 파일만 사용)
    - 시크릿은 JSON 평면 구조여야 함 ({"DATABASE_URL": "...", ...} 형태)
    - 이미 설정된 환경변수는 덮어쓰지 않음 → 배포에서 개별 override 가능
    """
    secret_name = os.getenv("AWS_SECRETS_NAME")
    if not secret_name:
        return

    region = os.getenv("AWS_REGION", "ap-northeast-2")

    import boto3  # 로컬 부팅 시 import 비용 회피

    client = boto3.client("secretsmanager", region_name=region)
    response = client.get_secret_value(SecretId=secret_name)
    payload = json.loads(response["SecretString"])

    for key, value in payload.items():
        os.environ.setdefault(key, str(value))

    logger.info(
        "Loaded %d entries from AWS Secrets Manager (%s)", len(payload), secret_name
    )


_load_aws_secrets_into_env()


# env_file 을 환경에 따라 선택 — 로컬은 커밋된 .env.example 을 기본으로 쓰고 (cp 불필요),
# 개인 override 가 필요하면 .env 에 같은 키를 넣으면 이긴다 (나중 파일이 우선).
# 배포(staging/production)는 compose `environment` 로 ENVIRONMENT 가 os.environ 에
# 들어오므로 .env 만 본다 (컨테이너에 파일이 없으면 무시되고 Secrets Manager/os.environ 이 값을 채운다).
_ENV_FILE = (
    (".env.example", ".env") if os.getenv("ENVIRONMENT", "local") == "local" else ".env"
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "Kaisa API"
    DEBUG: bool = False

    # 배포 환경 (local | staging | production) — Sentry environment 태그 등으로 사용
    ENVIRONMENT: str = "local"

    DATABASE_URL: str = "postgresql+asyncpg://kaisa:kaisa@localhost:5432/kaisa"

    # AWS Secrets Manager (staging/production에서 secret 이름 override)
    AWS_SECRETS_NAME: str = ""
    AWS_REGION: str = "ap-northeast-2"

    # CORS 허용 프론트엔드 주소
    FRONTEND_URL: str = "http://localhost:3000"
    # 추가 CORS 오리진 — 쉼표 구분. 비면 FRONTEND_URL 단일 허용
    CORS_ORIGINS: str = ""

    # 세션 (DB 세션 테이블 + httponly 쿠키 — opaque 랜덤 토큰, 서명키 없음)
    SESSION_COOKIE_NAME: str = "kaisa_session"
    SESSION_TTL_HOURS: int = 24
    # 개인회원(PASS 본인인증) 세션 유효시간 — 관리자(24h)와 분리. 지나면 재인증 필요
    USER_SESSION_TTL_MINUTES: int = 10

    # 개인정보 암호화 (Fernet) — 없으면 부팅 시 ValueError (core/crypto.py)
    CRYPTO_KEY: str = ""
    # 진위확인 요청 IP 해시용 솔트 — 비면 CRYPTO_KEY 사용
    IP_HASH_SALT: str = ""

    # PortOne (본인인증·결제)
    PORTONE_API_BASE: str = "https://api.portone.io"
    PORTONE_STORE_ID: str = ""
    PORTONE_API_SECRET: str = ""
    PORTONE_PAYMENT_CHANNEL_KEY: str = ""
    PORTONE_IDENTITY_CHANNEL_KEY: str = ""
    PORTONE_WEBHOOK_SECRET: str = ""

    # AWS S3 (앱 파일 저장) — 버킷명만 있으면 활성화. 자격증명은 명시 키(로컬 .env) 또는
    # IAM 인스턴스 롤(서버)에서 boto3 가 자동 사용하므로 ACCESS_KEY 유무로 판단하지 않는다
    S3_BUCKET_NAME: str = ""

    # Rate limit
    RATE_LIMIT_LOGIN_MAX: int = 5
    RATE_LIMIT_LOGIN_WINDOW: int = 300  # 초
    RATE_LIMIT_PUBLIC_VERIFY_MAX: int = 10
    RATE_LIMIT_PUBLIC_VERIFY_WINDOW: int = 60  # 초

    # 확인서 유효기간 (일). 0 = 무기한
    CERTIFICATE_VALID_DAYS: int = 0

    # 확인서 발급 가능 기간 (일) — 수강 시작일 기준. 초과 이력은 발급 신청 불가
    CERTIFICATE_ISSUE_WINDOW_DAYS: int = 3 * 365

    # 무료 재발급 기간 (일) — 직전 발급일 기준. 이내면 재발급 0원, 초과면 유료
    CERTIFICATE_REISSUE_FREE_DAYS: int = 7

    # 시드용 마스터 admin 계정 (make seed)
    ADMIN_EMAIL: str = "admin@example.com"
    ADMIN_PASSWORD: str = ""

    # Sentry — 비우면 비활성화 (로컬 기본값)
    SENTRY_DSN: str = ""
    RELEASE: str = ""

    @property
    def cors_origins(self) -> list[str]:
        if self.CORS_ORIGINS:
            return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        return [self.FRONTEND_URL]


settings = Settings()
