"""앱 내 일일 스케줄러 — 스케줄러 인프라 없이 시간 기반 작업을 돌리기 위한 최소 장치.

전제: uvicorn workers=1 (Dockerfile 고정) — 인프로세스 태스크라 중복 실행이 없다.
다중 워커·다중 인스턴스로 확장하면 제거하거나 분산 잠금으로 교체해야 한다.

만료일이 지나면 자동 일반 전환을 해야 하는데, 전환 로직(expire_due_memberships)은
등급을 읽는 API 진입부에서만 호출된다 — 트래픽이 없는 날엔 전환이 늦어진다.
매일 KST 09:00 에 강제로 돌려 이 빈틈을 막는다 (2026-11-06).
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

KST = ZoneInfo("Asia/Seoul")


def next_run_delay_seconds(now: datetime, hour: int, minute: int) -> float:
    """지금(now — KST 인식 시각)부터 다음 {hour}:{minute} KST 까지 초. 순수 함수."""
    target_today = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if now < target_today:
        return (target_today - now).total_seconds()
    tomorrow = target_today + timedelta(days=1)
    return (tomorrow - now).total_seconds()


async def run_daily_task(
    hour: int,
    minute: int,
    name: str,
    job: Callable[[], Awaitable[object]],
    retry_delay_seconds: float = 600.0,
) -> None:
    """매일 {hour}:{minute} KST 에 job 을 실행하는 루프 — 취소될 때까지.

    job 이 예외를 던져도 앱이 죽지 않게 흡수하고, 그날은 10분 뒤 한 번만 재시도
    (실패 → 재시도 성공 → 다음 날 정시) 한다.
    """
    logger.info("스케줄러 시작: %s — 매일 %02d:%02d KST", name, hour, minute)
    retried = False
    while True:
        delay = next_run_delay_seconds(datetime.now(KST), hour, minute)
        await asyncio.sleep(delay)
        try:
            await job()
            retried = False
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("스케줄 작업 실패: %s", name)
            if not retried:
                retried = True
                await asyncio.sleep(retry_delay_seconds)
                try:
                    await job()
                    retried = False
                except Exception:
                    logger.exception("스케줄 작업 재시도 실패: %s — 내일 정시에 재시도", name)
            continue
