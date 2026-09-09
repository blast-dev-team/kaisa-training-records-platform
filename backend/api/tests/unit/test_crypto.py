"""단위 — 개인정보 암호화·해싱·마스킹 (무DB)."""

import pytest

from app.core.crypto import (
    decrypt_field,
    encrypt_field,
    hash_ip,
    mask_name,
    mask_phone,
    sha256_hex,
)


class TestFernetField:
    def test_roundtrip(self):
        plain = "01012345678"
        token = encrypt_field(plain)
        assert token != plain
        assert decrypt_field(token) == plain

    def test_none_passthrough(self):
        assert encrypt_field(None) is None
        assert decrypt_field(None) is None

    def test_ciphertext_nondeterministic(self):
        # Fernet 은 매번 다른 토큰을 낸다 — 같은 평문이라도 저장값이 노출 패턴을 만들지 않는다
        assert encrypt_field("01012345678") != encrypt_field("01012345678")

    def test_tampered_token_raises(self):
        token = encrypt_field("01012345678")
        with pytest.raises(ValueError):
            decrypt_field(token[:-4] + "AAAA")


class TestSha256:
    def test_deterministic(self):
        assert sha256_hex("ci-value") == sha256_hex("ci-value")

    def test_different_inputs_differ(self):
        assert sha256_hex("ci-a") != sha256_hex("ci-b")

    def test_output_is_64_hex(self):
        value = sha256_hex("ci-value")
        assert len(value) == 64
        int(value, 16)  # hex 검증

    def test_hash_ip_uses_salt(self):
        # 솔트 없는 sha256_hex 와 결과가 달라야 한다 (무지성 무차별 대조 방지)
        assert hash_ip("1.2.3.4") != sha256_hex("1.2.3.4")


class TestMaskPhone:
    def test_standard_11_digits(self):
        assert mask_phone("01012345678") == "010-****-5678"

    def test_input_with_dashes(self):
        assert mask_phone("010-1234-5678") == "010-****-5678"

    def test_short_digits_all_masked(self):
        assert mask_phone("1234567") == "*******"

    def test_none_and_empty(self):
        assert mask_phone(None) is None
        assert mask_phone("") is None


class TestMaskName:
    def test_three_char(self):
        assert mask_name("홍길동") == "홍**"

    def test_two_char(self):
        assert mask_name("김철") == "김*"

    def test_single_char(self):
        assert mask_name("김") == "김"

    def test_long_name_caps_at_two_stars(self):
        assert mask_name("선우선덕") == "선**"

    def test_none(self):
        assert mask_name(None) is None
