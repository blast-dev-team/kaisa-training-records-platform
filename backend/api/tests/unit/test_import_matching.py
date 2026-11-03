"""단위 — import_legacy_education 동일인 수렴 헬퍼(_resolve_existing_trainee).

마스터 갱신분 재임포트 시 어드민 수동 생성분(TR-)까지 같은 사람으로 수렴시켜
중복 교육생이 만들어지지 않게 하는 매칭 규칙을 검증한다.
① 증번호(cert·senior 양축) ② 이름+생년 — 순서·모호 판정 포함.
"""

import uuid
from datetime import date
from types import SimpleNamespace

from app.core.crypto import name_columns
from app.scripts.import_legacy_education import _resolve_existing_trainee


def _trainee(cert_no=None, senior=None, birth="1965-01-01"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        cert_no=cert_no,
        senior_cert_no=senior,
        birth_date=date.fromisoformat(birth) if birth else None,
    )


def _identity_key(name, birth):
    return (name_columns(name)[1], birth)


def test_cert_exact_match():
    row = _trainee(cert_no="정보시스템감리협회 제6010호", birth="1969-02-15")
    found = _resolve_existing_trainee(
        {"정보시스템감리협회 제6010호": [row]}, {}, "정보시스템감리협회 제6010호", "김기원", None
    )
    assert found is row


def test_senior_axis_match():
    row = _trainee(cert_no=None, senior="정보시스템감리협회 제371호")
    found = _resolve_existing_trainee(
        {"정보시스템감리협회 제371호": [row]}, {}, "정보시스템감리협회 제371호", "이강희", None
    )
    assert found is row


def test_cert_duplicate_narrowed_by_birth():
    a = _trainee(cert_no="정보시스템감리협회 제6149호", birth="1964-01-13")
    b = _trainee(cert_no="정보시스템감리협회 제6149호", birth="1965-07-25")
    found = _resolve_existing_trainee(
        {"정보시스템감리협회 제6149호": [a, b]},
        {},
        "정보시스템감리협회 제6149호",
        "김정희",
        date(1964, 1, 13),
    )
    assert found is a


def test_cert_duplicate_converges_to_first():
    """증번호는 유일 식별자 — 여러 행에 걸치면 미통합 중복(같은 사람)이라 첫 행으로 수렴."""
    a = _trainee(cert_no="정보시스템감리협회 제100호", birth="1964-01-13")
    b = _trainee(cert_no="정보시스템감리협회 제100호", birth="1964-01-13")
    found = _resolve_existing_trainee(
        {"정보시스템감리협회 제100호": [a, b]},
        {},
        "정보시스템감리협회 제100호",
        "김갑돌",
        date(1964, 1, 13),
    )
    assert found is a


def test_cert_miss_falls_back_to_identity():
    """증번호가 DB 어디에도 없어도 이름+생년으로 수렴한다 — 백승철(부산 제22호) 케이스."""
    row = _trainee(cert_no="정보시스템감리협회 제5737호", birth="1968-01-24")
    found = _resolve_existing_trainee(
        {}, {_identity_key("백승철", "1968-01-24"): row}, "부산 제22호", "백승철", date(1968, 1, 24)
    )
    assert found is row


def test_cert_conflict_different_birth_falls_back_to_identity():
    """증번호 충돌인데 생년이 전부 다르면 다른 사람 가능성 — 이름+생년으로 재판정한다.

    제610호 충돌 사례: EDU-610(1965)은 다른 사람, 박종삼(1964-05-07)은 EDU-7598.
    """
    other = _trainee(cert_no="정보시스템감리협회 제610호", birth="1965-11-03")
    real = _trainee(cert_no="정보시스템감리협회 제610호", birth="1964-05-07")
    found = _resolve_existing_trainee(
        {"정보시스템감리협회 제610호": [other, real]},
        {_identity_key("박종삼", "1964-05-07"): real},
        "정보시스템감리협회 제610호",
        "박종삼",
        date(1964, 5, 7),
    )
    assert found is real


def test_identity_fallback_without_cert():
    row = _trainee(cert_no=None, birth="1964-01-13")
    found = _resolve_existing_trainee(
        {}, {_identity_key("김정희", "1964-01-13"): row}, None, "김정희", date(1964, 1, 13)
    )
    assert found is row


def test_identity_requires_birth():
    found = _resolve_existing_trainee({}, {}, None, "김정희", None)
    assert found is None


def test_no_match_returns_none():
    found = _resolve_existing_trainee(
        {}, {}, "정보시스템감리협회 제9999호", "없는사람", date(1970, 1, 1)
    )
    assert found is None
