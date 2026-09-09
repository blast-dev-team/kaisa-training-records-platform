"""KST(UTC+9) 고정 시간 유틸 — naive datetime 금지.

서비스의 '지금'과 '오늘'은 KST 다. DB 저장은 timestamptz(UTC)로 하되,
입구에서 값을 만들 때는 반드시 이 모듈을 통한다. (rules/project/timezone.md)
"""

from datetime import date, datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))


def now_kst() -> datetime:
    """지금 (KST aware). datetime.now() 사용 금지."""
    return datetime.now(KST)


def today_kst() -> date:
    """오늘 (KST 기준 date). date.today() 사용 금지."""
    return now_kst().date()


def ensure_kst(dt: datetime) -> datetime:
    """naive 면 KST 로 못박기, aware 면 그대로.

    브라우저가 오프셋 없이 보낸 값(예: '2026-09-09T15:15')을 파싱한 직후
    반드시 통과시킨다. 방치하면 컨테이너(UTC) 타임존으로 해석돼 9시간 어긋난다.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=KST)
    return dt


def kst_range_start(d: date) -> datetime:
    """조회 경계 하한 — 반열림 [start, end) 의 start."""
    return datetime(d.year, d.month, d.day, tzinfo=KST)


def kst_range_end(d: date) -> datetime:
    """조회 경계 상한 — d 다음날 00:00 (KST)."""
    return kst_range_start(d) + timedelta(days=1)


def to_kst_date(dt: datetime) -> date:
    """datetime → KST 기준 date."""
    return ensure_kst(dt).astimezone(KST).date()
