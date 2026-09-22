"""개인정보 암호화·해싱·마스킹.

- phone 등 가역 보관 필드: Fernet 대칭 암호화 (encrypt_field/decrypt_field)
- CI/DI/IP 등 불가역 식별자: sha256_hex (원문 절대 저장 금지)
- 응답 노출은 항상 마스킹 (mask_phone/mask_name)
"""

import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

# 키 없이 부팅하면 즉시 실패 — 개인정보 암호화 없는 운영을 조용히 허용하지 않는다.
if not settings.CRYPTO_KEY:
    raise ValueError(
        "CRYPTO_KEY 가 설정되지 않았습니다. "
        "`openssl rand -base64 32` 로 생성해 .env 에 설정하세요."
    )

_fernet = Fernet(settings.CRYPTO_KEY.encode())


def encrypt_field(value: str | None) -> str | None:
    """평문 → Fernet 토큰. None 은 그대로 통과."""
    if value is None:
        return None
    return _fernet.encrypt(value.encode()).decode()


def decrypt_field(value: str | None) -> str | None:
    """Fernet 토큰 → 평문. None 은 그대로 통과."""
    if value is None:
        return None
    try:
        return _fernet.decrypt(value.encode()).decode()
    except InvalidToken as e:
        raise ValueError(
            "암호화 필드 복호화 실패 — CRYPTO_KEY 가 변경되었을 수 있음"
        ) from e


def sha256_hex(value: str) -> str:
    """식별자(CI/DI) 해시 — 매칭이 가능해야 하므로 솔트 없이 결정적."""
    return hashlib.sha256(value.encode()).hexdigest()


def hash_ip(ip: str) -> str:
    """진위확인 요청 IP 해시 — 솔트 사용 (IP_HASH_SALT 비면 CRYPTO_KEY)."""
    salt = settings.IP_HASH_SALT or settings.CRYPTO_KEY
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()


def mask_phone(phone: str | None) -> str | None:
    """'01012345678' → '010-****-1234'. 자릿수가 달라도 양끝만 노출."""
    if not phone:
        return None
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) < 8:
        return "*" * len(digits)
    return f"{digits[:3]}-****-{digits[-4:]}"


def mask_name(name: str | None) -> str | None:
    """'홍길동' → '홍**'. 첫 글자만 노출, 나머지는 최대 2자 마스킹."""
    if not name:
        return None
    return name[0] + "*" * min(len(name) - 1, 2)
