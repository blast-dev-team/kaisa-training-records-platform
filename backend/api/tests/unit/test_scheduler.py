"""단위 — 일일 스케줄러 다음 실행 시각 계산."""

import asyncio
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.core import scheduler
from app.core.scheduler import next_run_delay_seconds

KST = ZoneInfo("Asia/Seoul")


def _kst(h, m, s=0):
    return datetime(2026, 11, 6, h, m, s, tzinfo=KST)


def test_before_9am_runs_same_day():
    delay = next_run_delay_seconds(_kst(8, 0), 9, 0)
    assert delay == 3600.0


def test_after_9am_runs_next_day():
    delay = next_run_delay_seconds(_kst(9, 0, 1), 9, 0)
    assert delay == 23 * 3600 + 59 * 60 + 59.0


def test_exactly_at_9am_runs_next_day():
    delay = next_run_delay_seconds(_kst(9, 0), 9, 0)
    assert delay == 24 * 3600.0


def test_midnight_runs_same_day_9am():
    delay = next_run_delay_seconds(_kst(0, 0), 9, 0)
    assert delay == 9 * 3600.0


# ── KST 날짜 변경 즉시 실행 (2026-11-19) ─────────────────────────────────────


async def _drive(monkeypatch, start, stop_at, *, run_on_start, drift=0.0):
    """가짜 시계로 run_daily_task 를 돌려 job 실행 시각 목록을 돌려준다.

    drift: sleep 이 요청보다 짧게 깨는 오차(초) — 서버 시계 보정·타이머 오차 흉내.
    """
    clock = {"now": start}
    runs: list = []

    async def fake_sleep(s):
        clock["now"] += timedelta(seconds=max(s - drift, 0.001))
        if clock["now"] >= stop_at:
            raise asyncio.CancelledError

    async def job():
        runs.append(clock["now"])

    monkeypatch.setattr(scheduler.asyncio, "sleep", fake_sleep)
    with pytest.raises(asyncio.CancelledError):
        await scheduler.run_daily_task(
            0, 0, "t", job, run_on_start=run_on_start, now_fn=lambda: clock["now"]
        )
    return runs


async def test_runs_right_at_kst_midnight(monkeypatch):
    runs = await _drive(
        monkeypatch,
        datetime(2026, 11, 6, 23, 59, 30, tzinfo=KST),
        datetime(2026, 11, 8, 0, 30, tzinfo=KST),
        run_on_start=False,
    )
    assert runs == [
        datetime(2026, 11, 7, 0, 0, tzinfo=KST),
        datetime(2026, 11, 8, 0, 0, tzinfo=KST),
    ]


async def test_never_runs_before_midnight_even_if_sleep_wakes_early(monkeypatch):
    runs = await _drive(
        monkeypatch,
        datetime(2026, 11, 6, 22, 0, tzinfo=KST),
        datetime(2026, 11, 7, 0, 30, tzinfo=KST),
        run_on_start=False,
        drift=5.0,
    )
    assert len(runs) == 1
    assert runs[0].date() == date(2026, 11, 7)
    assert runs[0] - datetime(2026, 11, 7, 0, 0, tzinfo=KST) < timedelta(seconds=1)


async def test_runs_once_on_start_then_at_midnight(monkeypatch):
    runs = await _drive(
        monkeypatch,
        datetime(2026, 11, 7, 0, 3, tzinfo=KST),  # 자정 직후 재시작
        datetime(2026, 11, 8, 0, 30, tzinfo=KST),
        run_on_start=True,
    )
    assert runs == [
        datetime(2026, 11, 7, 0, 3, tzinfo=KST),
        datetime(2026, 11, 8, 0, 0, tzinfo=KST),
    ]


def test_utc_server_clock_still_uses_kst_date():
    # 서버 TZ 가 UTC 여도 KST 기준 — UTC 15:00 = KST 다음날 00:00
    utc_now = datetime(2026, 11, 6, 14, 59, 59, tzinfo=UTC).astimezone(KST)
    assert scheduler.latest_slot_date(utc_now, 0, 0) == date(2026, 11, 6)
    assert next_run_delay_seconds(utc_now, 0, 0) == 1.0
