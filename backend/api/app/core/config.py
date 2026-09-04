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

    # Sentry — 비우면 비활성화 (로컬 기본값)
    SENTRY_DSN: str = ""
    RELEASE: str = ""


settings = Settings()
