"""단위 — 가격 규칙 선택 순수함수 (무DB, ORM 인스턴스만 사용)."""

from datetime import datetime
from uuid import uuid4

from app.core.kst import now_kst
from app.domain.certificate.model import CertificatePricingRule
from app.domain.certificate.service.pricing import select_pricing_rule

GRADE_A = uuid4()
GRADE_B = uuid4()


def _rule(
    grade_id=GRADE_A,
    issue_type="original",
    amount=10000,
    valid_from=None,
    valid_to=None,
    is_active=True,
) -> CertificatePricingRule:
    return CertificatePricingRule(
        membership_grade_id=grade_id,
        issue_type=issue_type,
        price_krw=amount,
        currency="KRW",
        valid_from=valid_from or now_kst().replace(year=2020),
        valid_to=valid_to,
        is_active=is_active,
    )


class TestSelectPricingRule:
    def test_matches_grade_and_issue_type(self):
        rules = [_rule(grade_id=GRADE_A), _rule(grade_id=GRADE_B, amount=999)]
        assert (
            select_pricing_rule(rules, GRADE_A, "original", now_kst()).price_krw
            == 10000
        )

    def test_issue_type_must_match(self):
        rules = [_rule(issue_type="reissue", amount=999)]
        assert select_pricing_rule(rules, GRADE_A, "original", now_kst()) is None

    def test_inactive_excluded(self):
        rules = [_rule(is_active=False)]
        assert select_pricing_rule(rules, GRADE_A, "original", now_kst()) is None

    def test_not_yet_valid_excluded(self):
        future = now_kst().replace(year=now_kst().year + 1)
        rules = [_rule(valid_from=future)]
        assert select_pricing_rule(rules, GRADE_A, "original", now_kst()) is None

    def test_expired_excluded(self):
        past = now_kst().replace(year=2020)
        rules = [_rule(valid_from=past, valid_to=now_kst().replace(year=2021))]
        assert select_pricing_rule(rules, GRADE_A, "original", now_kst()) is None

    def test_valid_to_none_means_open_ended(self):
        past = now_kst().replace(year=2020)
        rules = [_rule(valid_from=past, valid_to=None)]
        assert select_pricing_rule(rules, GRADE_A, "original", now_kst()) is rules[0]

    def test_valid_to_boundary_is_exclusive(self):
        # valid_to == now → now < valid_to 가 거짓이라 만료 취급
        past = now_kst().replace(year=2020)
        rules = [_rule(valid_from=past, valid_to=now_kst())]
        assert select_pricing_rule(rules, GRADE_A, "original", now_kst()) is None

    def test_latest_valid_from_wins(self):
        base = now_kst().replace(year=2020)
        rules = [
            _rule(valid_from=base, amount=1000),
            _rule(valid_from=base.replace(year=2022), amount=2000),
            _rule(valid_from=base.replace(year=2021), amount=1500),
        ]
        assert (
            select_pricing_rule(rules, GRADE_A, "original", now_kst()).price_krw == 2000
        )

    def test_empty_rules(self):
        assert select_pricing_rule([], GRADE_A, "original", now_kst()) is None

    def test_boundary_valid_from_inclusive(self):
        ts: datetime = now_kst()
        rules = [_rule(valid_from=ts)]
        assert select_pricing_rule(rules, GRADE_A, "original", ts) is rules[0]
