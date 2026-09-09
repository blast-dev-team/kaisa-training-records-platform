"""가격 규칙 선택 — 순수함수 (무DB, 단위테스트 대상)."""

from datetime import datetime

from app.domain.certificate.model import CertificatePricingRule


def select_pricing_rule(
    rules: list[CertificatePricingRule],
    membership_grade_id,
    issue_type: str,
    now: datetime,
) -> CertificatePricingRule | None:
    """grade×issue_type 일치 + 활성 + 유효구간(valid_from ≤ now < valid_to, None=무제한) 중
    valid_from 이 가장 최신인 규칙 반환. 없으면 None.
    """
    matched = [
        r
        for r in rules
        if r.membership_grade_id == membership_grade_id
        and r.issue_type == issue_type
        and r.is_active
        and r.valid_from <= now
        and (r.valid_to is None or r.valid_to > now)
    ]
    return max(matched, key=lambda r: r.valid_from, default=None)
