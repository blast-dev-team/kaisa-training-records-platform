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


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
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

    # Rate limit
    RATE_LIMIT_LOGIN_MAX: int = 5
    RATE_LIMIT_LOGIN_WINDOW: int = 300  # 초
    RATE_LIMIT_PUBLIC_VERIFY_MAX: int = 10
    RATE_LIMIT_PUBLIC_VERIFY_WINDOW: int = 60  # 초

    # 확인서 유효기간 (일). 0 = 무기한
    CERTIFICATE_VALID_DAYS: int = 0

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
