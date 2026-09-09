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


def is_rate_limited(key: str, max_attempts: int, window_seconds: int) -> bool:
    now = time.monotonic()
    with _lock:
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
        q.append(now)


def clear_attempts(key: str) -> None:
    with _lock:
        _attempts.pop(key, None)
