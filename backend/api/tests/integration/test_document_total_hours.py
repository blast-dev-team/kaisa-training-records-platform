"""확인서 합계 = 사내 합계 + min(외부 합계, 16) — 행은 그대로, 합계만 고정.

한도 도입 전에 외부교육이 16시간을 넘게 등록된 감리원도 발급은 된다. 진위확인 합계는
PDF 합계와 같은 공식을 쓴다 (외부 판정은 이력의 현재 기관 구분 — 사내만 협회 교육).
"""

from decimal import Decimal

import pytest
from sqlalchemy import select

from app.domain.certificate.model import Certificate
from app.domain.institution.model import TrainingInstitution
from app.domain.training_record.service.external_hours import document_total_hours
from tests.integration.helpers import (
    make_grade,
    make_pricing,
    make_record,
    make_trainee,
    member_cookie,
    member_token,
)

D = Decimal

# FE(web·admin) document-total 테스트와 같은 표 — 세 곳이 같은 결과를 내야 한다
CASES = [
    ([], "0"),
    ([("8", False)], "8"),
    ([("10", True)], "10"),
    ([("16", True)], "16"),
    ([("20", True)], "16"),
    ([("10", True), ("10", True)], "16"),
    ([("8", False), ("10", True), ("10", True)], "24"),
    ([("8", False), ("12", False), ("4", True)], "24"),
    ([("16.5", True), ("2.5", False)], "18.5"),
    ([("15.5", True), ("0.5", True)], "16"),
    ([("40", False), ("30", True)], "56"),
]


class TestFormula:
    @pytest.mark.parametrize(("rows", "expected"), CASES)
    def test_cases(self, rows, expected):
        assert document_total_hours((D(h), ext) for h, ext in rows) == D(expected)


async def _issue(client, db, rows: list[tuple[str, str | None, bool]], code: str):
    """rows: (시간, 기관 구분 | None, 기관 연결 여부) → 한 묶음 발급 후 묶음 번호."""
    grade = await make_grade(db, code=code, name="합계등급")
    user, trainee = await make_trainee(db, grade.id, ci_raw=f"ci-{code}", trainee_no="TR-2026-0777")
    records = []
    for index, (hours, institution_type, linked) in enumerate(rows):
        record = await make_record(db, trainee.id, record_no=f"TRN-SUM-{code}-{index:03d}")
        record.total_hours = D(hours)
        record.completed_hours = D(hours)
        if linked:
            inst = TrainingInstitution(name=f"기관{code}{index}", institution_type=institution_type)
            db.add(inst)
            await db.flush()
            record.institution_id = inst.id
        records.append(record)
    await make_pricing(db, grade.id, price_krw=0)
    token = await member_token(db, user)
    await db.commit()

    resp = await client.post(
        "/api/certificate-requests/batch",
        json={"items": [{"training_record_id": str(r.id)} for r in records]},
        cookies=member_cookie(token),
    )
    assert resp.status_code == 201, resp.json()
    cert = (
        await db.execute(select(Certificate).where(Certificate.status == "issued").limit(1))
    ).scalar_one()
    return cert.bundle_no or cert.certificate_no


async def _verify_total(client, no: str):
    resp = await client.post(
        "/api/public/certificate-verifications", json={"certificate_no": no, "name": "홍길동"}
    )
    body = resp.json()
    assert body["result"] == "valid", body
    return body


class TestVerificationTotal:
    async def test_over_cap_external_fixed_to_16_rows_unchanged(self, client, db):
        no = await _issue(
            client, db,
            [("8", "internal", True), ("10", "external", True), ("10", "external", True)],
            "g-sum1",
        )
        body = await _verify_total(client, no)
        assert D(body["total_hours"]) == D("24")  # 8 + min(20, 16)
        # 행은 원래 시간 그대로
        assert sorted(D(r["total_hours"]) for r in body["records"]) == [D(8), D(10), D(10)]

    async def test_internal_only_not_capped(self, client, db):
        no = await _issue(
            client, db, [("12", "internal", True), ("10", "internal", True)], "g-sum2"
        )
        assert D((await _verify_total(client, no))["total_hours"]) == D("22")

    async def test_exactly_16_external(self, client, db):
        no = await _issue(client, db, [("16", "external", True)], "g-sum3")
        assert D((await _verify_total(client, no))["total_hours"]) == D("16")

    async def test_null_type_and_unlinked_count_as_external(self, client, db):
        no = await _issue(
            client, db, [("10", None, True), ("10", None, False), ("4", "internal", True)], "g-sum4"
        )
        assert D((await _verify_total(client, no))["total_hours"]) == D("20")  # 4 + 16
