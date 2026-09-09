import base64
import hashlib
import hmac
import json
import secrets
import time

from app.core.config import settings

_ITERATIONS = 200_000
_ALGO = "sha256"


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        _ALGO, password.encode("utf-8"), salt.encode("utf-8"), _ITERATIONS
    )
    return f"pbkdf2${_ALGO}${_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        scheme, algo, iterations_str, salt, expected_hex = password_hash.split("$")
    except ValueError:
        return False
    if scheme != "pbkdf2":
        return False
    digest = hashlib.pbkdf2_hmac(
        algo, password.encode("utf-8"), salt.encode("utf-8"), int(iterations_str)
    )
    return hmac.compare_digest(digest.hex(), expected_hex)


def validate_password(password: str) -> bool:
    """관리자 비밀번호 정책 — 10자 이상, 영문+숫자 조합."""
    return (
        len(password) >= 10
        and any(c.isalpha() for c in password)
        and any(c.isdigit() for c in password)
    )


# ── PASS 본인인증 redirect state (자기수증 토큰) ────────────────────────────────
# identity_verifications.user_id NOT NULL 이라 인증 row는 complete 시점에 생성한다.
# 시작 시점의 CSRF state 는 서명된 자기수증 토큰으로 대체 — DB 없이 위변조·만료 검사.

_STATE_TTL_SECONDS = 600


def _state_key() -> bytes:
    return hashlib.sha256(("state:" + settings.CRYPTO_KEY).encode()).digest()


def issue_state(verification_id: str) -> str:
    """`payload.sig` 형식 — payload 는 base64url JSON {v, exp, iv}."""
    payload = (
        base64.urlsafe_b64encode(
            json.dumps(
                {
                    "v": verification_id,
                    "exp": int(time.time()) + _STATE_TTL_SECONDS,
                    "n": secrets.token_hex(8),
                }
            ).encode()
        )
        .decode()
        .rstrip("=")
    )
    sig = hmac.new(_state_key(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def read_state(state: str) -> str | None:
    """검증 성공 시 verification_id 반환. 위변조·만료면 None."""
    payload, _, sig = state.rpartition(".")
    if not payload:
        return None
    expected = hmac.new(_state_key(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    try:
        padded = payload + "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded))
    except (ValueError, TypeError):
        return None
    if data.get("exp", 0) < time.time():
        return None
    v = data.get("v")
    return v if isinstance(v, str) and v else None
