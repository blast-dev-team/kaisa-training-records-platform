"""S3 파일 클라이언트 — presigned URL 발급.

버킷명(S3_BUCKET_NAME)이 비어 있으면 파일 기능 비활성 — 서비스 레이어에서
먼저 검사한다. 자격증명은 명시 키(로컬 .env) 또는 EC2 인스턴스 롤(서버)에서
boto3가 자동으로 사용한다 (config 주석 참고).
"""

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client("s3", region_name=settings.AWS_REGION)
    return _client


def is_s3_configured() -> bool:
    return bool(settings.S3_BUCKET_NAME)


def presigned_download_url(key: str, expires_in: int = 600) -> str:
    """S3 객체 다운로드 presigned URL. 실패 시 RuntimeError — 서비스가 502로 변환."""
    try:
        return _get_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET_NAME, "Key": key},
            ExpiresIn=expires_in,
        )
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError(f"S3 presigned URL 발급 실패: {exc}") from exc
