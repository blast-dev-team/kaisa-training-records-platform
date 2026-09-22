"""통합 — 확인서 PDF 다운로드 신고: 본인 건만 기록, 최초 시각·횟수 누적."""

import pytest
from sqlalchemy import select

from app.domain.certificate.model import Certificate
from app.integrations import portone
from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_pricing,
    make_record,
    make_trainee,
    member_cookie,
    member_token,
    portone_payment,
)


@pytest.fixture
def portone_mock(monkeypatch):
    async def fake_get(payment_id):
        return portone_payment(payment_id, total=5000)

    monkeypatch.setattr(portone, "get_payment", fake_get)


async def _issue_certificate(client, db):
    """회원이 결제까지 완료해 확인서를 발급받은 상태를 만든다."""
    grade = await make_grade(db, code="g-dl", name="다운등급")
    user, trainee = await make_trainee(
        db, grade.id, ci_raw="ci-dl", trainee_no="TR-2026-0041"
    )
    record = await make_record(db, trainee.id, record_no="TRN-DL-0001")
    await make_pricing(db, grade.id, price_krw=5000)
    await db.commit()

    req = await client.post(
        "/api/certificate-requests",
        json={"training_record_id": str(record.id), "issue_type": "original"},
        cookies=member_cookie(await member_token(db, user)),
    )
    order_no = req.json()["order_no"]
    confirm = await client.post(
        f"/api/payments/{order_no}/confirm",
        cookies=member_cookie(await member_token(db, user)),
    )
    assert confirm.status_code == 200, confirm.text
    cert = (
        await db.execute(
            select(Certificate).where(Certificate.revoked_at.is_(None))
        )
    ).scalar_one()
    return user, trainee, cert


class TestCertificateDownloadLog:
    async def test_own_download_recorded(self, client, db, portone_mock):
        _, admin_token = await make_admin(db)
        user, _trainee, cert = await _issue_certificate(client, db)

        resp = await client.post(
            f"/api/me/certificates/{cert.id}/downloaded",
            cookies=member_cookie(await member_token(db, user)),
        )
        assert resp.status_code == 200

        await db.refresh(cert)
        assert cert.downloaded_at is not None
        assert cert.download_count == 1

        # 어드민 응답에 노출
        resp = await client.get(
            "/api/certificates", cookies=admin_cookie(admin_token)
        )
        target = next(i for i in resp.json()["items"] if i["id"] == str(cert.id))
        assert target["download_count"] == 1

    async def test_other_member_certificate_ignored(self, client, db, portone_mock):
        _actor, admin_token = await make_admin(db)
        _user, _trainee, cert = await _issue_certificate(client, db)

        # 다른 교육생
        other_grade = await make_grade(db, code="g-dl2", name="타인등급2")
        other_user, _ = await make_trainee(
            db, other_grade.id, ci_raw="ci-dl-other", trainee_no="TR-2026-0042"
        )
        await db.commit()

        resp = await client.post(
            f"/api/me/certificates/{cert.id}/downloaded",
            cookies=member_cookie(await member_token(db, other_user)),
        )
        assert resp.status_code == 200  # 조용히 무시

        await db.refresh(cert)
        assert cert.downloaded_at is None
        assert cert.download_count == 0
