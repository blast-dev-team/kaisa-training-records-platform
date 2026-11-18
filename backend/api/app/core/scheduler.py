"""앱 내 일일 스케줄러 — 스케줄러 인프라 없이 시간 기반 작업을 돌리기 위한 최소 장치.

전제: uvicorn workers=1 (Dockerfile 고정) — 인프로세스 태스크라 중복 실행이 없다.
다중 워커·다중 인스턴스로 확장하면 제거하거나 분산 잠금으로 교체해야 한다.

만료일이 지나면 자동 일반 전환을 해야 하는데, 전환 로직(expire_due_memberships)은
등급을 읽는 API 진입부에서만 호출된다 — 트래픽이 없는 날엔 전환이 늦어진다.
매일 KST 날짜가 바뀌는 즉시(00:00) 강제로 돌려 이 빈틈을 막는다 (2026-11-06, 2026-11-19 보강:
앱 시작 시 1회 + 1분 단위로 실제 시각 재확인). 실행 시각은 main.py lifespan 의 hour/minute 값.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import date, datetime, time, timedelta
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


def latest_slot_date(now: datetime, hour: int, minute: int) -> date:
    """now 기준 가장 최근에 지난 {hour}:{minute} KST 실행 슬롯의 날짜."""
    if (now.hour, now.minute) >= (hour, minute):
        return now.date()
    return now.date() - timedelta(days=1)


def slot_at(day: date, hour: int, minute: int) -> datetime:
    return datetime.combine(day, time(hour, minute), tzinfo=KST)


async def _run_with_retry(
    name: str, job: Callable[[], Awaitable[object]], retry_delay_seconds: float
) -> None:
    """job 실행 — 예외는 흡수하고 그날 한 번만 retry_delay 뒤 재시도한다."""
    try:
        await job()
        return
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("스케줄 작업 실패: %s", name)
    # 매일 실패할 때마다 그날 한 번 재시도 — 예전에는 재시도까지 실패한 다음 날부터
    # 재시도 플래그가 남아 재시도가 영구히 생략됐다
    await asyncio.sleep(retry_delay_seconds)
    try:
        await job()
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("스케줄 작업 재시도 실패: %s — 다음 실행 시각에 재시도", name)


async def run_daily_task(
    hour: int,
    minute: int,
    name: str,
    job: Callable[[], Awaitable[object]],
    retry_delay_seconds: float = 600.0,
    *,
    run_on_start: bool = True,
    max_sleep_seconds: float = 60.0,
    now_fn: Callable[[], datetime] | None = None,
) -> None:
    """매일 {hour}:{minute} KST 에 job 을 실행하는 루프 — 취소될 때까지.

    - KST 날짜가 바뀌는 시점(hour=0, minute=0)에 바로 실행한다. 긴 sleep 한 번 대신
      최대 max_sleep_seconds 단위로 나눠 자며 매번 실제 시각(KST)을 다시 확인한다 —
      서버 시계 보정·절전 복귀로 sleep 이 어긋나도 자정 직후에 실행되고, 자정 전에
      잘못 깨어나 '어제 날짜'로 실행되는 일이 없다.
    - run_on_start: 앱 시작 시 한 번 실행(멱등 작업 전제) — 자정 무렵 재배포·재시작으로
      그날 실행을 놓치지 않게 한다.
    - job 이 예외를 던져도 앱이 죽지 않게 흡수하고, 그날은 retry_delay 뒤 한 번만 재시도.
    """
    clock = now_fn or (lambda: datetime.now(KST))
    logger.info("스케줄러 시작: %s — 매일 %02d:%02d KST", name, hour, minute)
    last_slot = latest_slot_date(clock(), hour, minute)
    if run_on_start:
        await _run_with_retry(name, job, retry_delay_seconds)
    while True:
        next_slot = slot_at(last_slot + timedelta(days=1), hour, minute)
        while (remaining := (next_slot - clock()).total_seconds()) > 0:
            await asyncio.sleep(min(remaining, max_sleep_seconds))
        await _run_with_retry(name, job, retry_delay_seconds)
        # 절전 등으로 여러 날을 건너뛰었어도 밀린 횟수만큼 반복하지 않고 한 번만 실행한다
        last_slot = latest_slot_date(clock(), hour, minute)
