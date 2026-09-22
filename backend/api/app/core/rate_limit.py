"""In-memory 슬라이딩 윈도우 rate limiter.

전제: uvicorn workers=1 (배포 Dockerfile 고정). 다중 워커·다중 인스턴스
환경으로 확장하면 공유 저장소(Redis 등)로 교체해야 한다.

사용 패턴 (로그인):
    if is_rate_limited(key): raise 429
    ... 검증 실패 시 register_attempt(key)
    ... 성공 시 clear_attempts(key)
"""

import time
from collections import defaultdict, deque
from threading import Lock

_attempts: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()

# 키 수 상한 — 공격자가 IP·계정을 회전해 키를 무한 생성하는 메모리 DoS 방어.
# 초과 시 빈 큐를 비우고, 그래도 넘치면 가장 오래된 키부터 버린다 (가용성 우선).
_MAX_KEYS = 10_000


def _evict_locked() -> None:
    if len(_attempts) <= _MAX_KEYS:
        return
    for key in [k for k, q in _attempts.items() if not q]:
        del _attempts[key]
    while len(_attempts) > _MAX_KEYS:
        _attempts.pop(next(iter(_attempts)))


def is_rate_limited(key: str, max_attempts: int, window_seconds: int) -> bool:
    now = time.monotonic()
    with _lock:
        # 조회로 새 키가 만들어지기 전에 정리 — 새 빈 키가 evict 대상이 되지 않게
        _evict_locked()
        q = _attempts[key]
        while q and q[0] <= now - window_seconds:
            q.popleft()
        return len(q) >= max_attempts


def register_attempt(key: str, window_seconds: int) -> None:
    now = time.monotonic()
    with _lock:
        q = _attempts[key]
        while q and q[0] <= now - window_seconds:
            q.popleft()
        # 기록을 먼저 남기고 넘칠 때 정리 — append 전 정리하면 방금 만든 빈 키가 스스로 evict 된다
        q.append(now)
        _evict_locked()


def clear_attempts(key: str) -> None:
    with _lock:
        _attempts.pop(key, None)
