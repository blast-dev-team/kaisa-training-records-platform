"""단위 — KST 고정 시간 유틸 (무DB).

규칙(rules/project/timezone.md): '지금'과 '오늘'은 KST. KST 새벽(00~09시)은
로컬 기준과 UTC 기준 날짜가 갈리는 경계라, 잘못 구현하면 바로 걸린다.
"""

from datetime import date, datetime, timezone

from app.core.kst import (
    KST,
    ensure_kst,
    kst_range_end,
    kst_range_start,
    now_kst,
    today_kst,
    to_kst_date,
)


class TestEnsureKst:
    def test_naive_gets_kst(self):
        naive = datetime(2026, 9, 9, 15, 15)
        aware = ensure_kst(naive)
        assert aware.tzinfo is KST

    def test_aware_passthrough(self):
        aware = datetime(2026, 9, 9, 15, 15, tzinfo=KST)
        assert ensure_kst(aware) is aware

    def test_utc_aware_not_silently_shifted(self):
        # aware 는 값 유지 — 변환은 to_kst_date 의 책임
        utc_dt = datetime(2026, 9, 9, 6, 0, tzinfo=timezone.utc)
        assert ensure_kst(utc_dt).utcoffset() == timezone.utc.utcoffset(None)


class TestKstDate:
    def test_utc_evening_is_next_kst_day(self):
        # KST 새벽 경계 — UTC 17:00 == KST 다음날 02:00
        assert to_kst_date(datetime(2026, 8, 10, 17, 0, tzinfo=timezone.utc)) == date(
            2026, 8, 11
        )

    def test_utc_morning_same_kst_day(self):
        assert to_kst_date(datetime(2026, 8, 10, 3, 0, tzinfo=timezone.utc)) == date(
            2026, 8, 10
        )

    def test_naive_treated_as_kst(self):
        assert to_kst_date(datetime(2026, 8, 10, 23, 30)) == date(2026, 8, 10)

    def test_today_kst_is_nows_date(self):
        assert today_kst() == to_kst_date(now_kst())


class TestRange:
    def test_half_open_interval(self):
        d = date(2026, 9, 9)
        start = kst_range_start(d)
        end = kst_range_end(d)
        assert start == datetime(2026, 9, 9, 0, 0, tzinfo=KST)
        assert end == datetime(2026, 9, 10, 0, 0, tzinfo=KST)
        # [start, end) — end 는 다음날 경계에 포함되지 않는다
        assert start.tzinfo is KST


class TestNowKst:
    def test_offset_is_plus_nine(self):
        assert now_kst().utcoffset().total_seconds() == 9 * 3600
