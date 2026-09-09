"""단위 — 관리자 비밀번호 정책 + PASS state 자기수증 토큰 (무DB)."""

import time

import pytest

from app.core.security import (
    hash_password,
    issue_state,
    read_state,
    validate_password,
    verify_password,
)


class TestPasswordPolicy:
    @pytest.mark.parametrize(
        "password",
        ["short1a", "abcdefghij", "1234567890", "비밀번호입니다123"],
    )
    def test_rejects_weak(self, password):
        assert not validate_password(password)

    @pytest.mark.parametrize(
        "password",
        ["admin-passw0rd", "0123456789a", "aaaaaaaaa1"],
    )
    def test_accepts_strong(self, password):
        assert validate_password(password)


class TestPasswordHash:
    def test_roundtrip(self):
        hashed = hash_password("s3cret-passw0rd")
        assert hashed != "s3cret-passw0rd"
        assert hashed.startswith("pbkdf2$")
        assert verify_password("s3cret-passw0rd", hashed)
        assert not verify_password("wrong-passw0rd", hashed)

    def test_salt_makes_unique_hashes(self):
        assert hash_password("same-passw0rd") != hash_password("same-passw0rd")

    def test_malformed_hash_returns_false(self):
        assert not verify_password("x", "not-a-hash")
        assert not verify_password("x", "")


class TestStateToken:
    def test_roundtrip(self):
        state = issue_state("verification-123")
        assert read_state(state) == "verification-123"

    def test_tampered_signature_rejected(self):
        state = issue_state("verification-123")
        payload, _, sig = state.rpartition(".")
        assert read_state(f"{payload}.{'0' * len(sig)}") is None

    def test_expired_state_rejected(self, monkeypatch):
        real_now = time.time()
        state = issue_state("verification-123")
        # 발급 시각보다 601초 뒤 — TTL 600초 초과
        monkeypatch.setattr(time, "time", lambda: real_now + 601)
        assert read_state(state) is None

    def test_garbage_rejected(self):
        assert read_state("") is None
        assert read_state("abc") is None
        assert read_state("a.b") is None
