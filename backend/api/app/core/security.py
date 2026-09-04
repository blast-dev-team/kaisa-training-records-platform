import hashlib
import hmac
import secrets

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
