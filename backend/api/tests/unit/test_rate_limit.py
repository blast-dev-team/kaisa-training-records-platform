"""단위 — in-memory rate limiter 키 수 상한(IP 회전 메모리 DoS 방어)."""

import pytest

from app.core import rate_limit


@pytest.fixture(autouse=True)
def _clean():
    rate_limit._attempts.clear()
    yield
    rate_limit._attempts.clear()


def test_eviction_caps_key_count_and_keeps_recent():
    for i in range(rate_limit._MAX_KEYS + 500):
        rate_limit.register_attempt(f"key-{i}", window_seconds=60)

    assert len(rate_limit._attempts) <= rate_limit._MAX_KEYS
    # 가장 오래된 키부터 버려지므로 최근 키는 살아 있다 — 최근 공격 시도의 제한은 유지
    assert f"key-{rate_limit._MAX_KEYS + 499}" in rate_limit._attempts


def test_empty_keys_pruned_before_overflow_eviction():
    for i in range(100):
        rate_limit.register_attempt(f"old-{i}", window_seconds=60)
        rate_limit._attempts[f"old-{i}"].clear()  # 창이 지나 빈 큐가 된 상태

    for i in range(rate_limit._MAX_KEYS + 10):
        rate_limit.register_attempt(f"new-{i}", window_seconds=60)

    assert len(rate_limit._attempts) <= rate_limit._MAX_KEYS
    # 빈 큐가 먼저 정리됐다면 최근 키가 잘리지 않는다
    assert f"new-{rate_limit._MAX_KEYS + 9}" in rate_limit._attempts


def test_limiter_still_counts_after_eviction():
    rate_limit.register_attempt("victim", window_seconds=60)
    assert rate_limit.is_rate_limited("victim", 1, 60) is True
