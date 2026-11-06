"""단위 — 일일 스케줄러 다음 실행 시각 계산."""

from datetime import datetime
from zoneinfo import ZoneInfo

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
