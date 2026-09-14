"""통합 — 공개 진위확인: 인증 없음, 마스킹, 로그(IP 해시), rate limit."""

from sqlalchemy import select

from app.core.kst import to_kst_date
from app.domain.certificate.model import Certificate, CertificateVerificationLog
from tests.integration.helpers import (
    make_admin,
    make_grade,
    make_pricing,
    make_record,
    make_trainee,
    member_cookie,
    member_token,
)


async def _issued_cert(client, db):
    """0원 발급 완료 상태의 (certificate, member_token) 생성."""
    grade = await make_grade(db, code="g-pub", name="공개등급")
    user, _ = await make_trainee(
        db, grade.id, ci_raw="ci-pub", trainee_no="TR-2026-0020"
    )
    record = await make_record(db, _.id, record_no="TRN-PUB-0001")
    await make_pricing(db, grade.id)
    token = await member_token(db, user)
    await db.commit()

    resp = await client.post(
        "/api/certificate-requests",
        json={"training_record_id": str(record.id), "issue_type": "original"},
        cookies=member_cookie(token),
    )
    assert resp.status_code == 201
    cert = (
        await db.execute(select(Certificate).where(Certificate.status == "issued"))
    ).scalar_one()
    return cert, token


async def _verify(client, cert_no: str, issue_date):
    return await client.post(
        "/api/public/certificate-verifications",
        json={"certificate_no": cert_no, "issue_date": str(issue_date)},
    )


class TestVerify:
    async def test_valid_masked(self, client, db):
        cert, _ = await _issued_cert(client, db)
        resp = await _verify(client, cert.certificate_no, to_kst_date(cert.issued_at))
        assert resp.status_code == 200
        body = resp.json()
        assert body["result"] == "valid"
        assert body["certificate_no"] == cert.certificate_no
        assert body["issued_name_masked"] == "홍**"
        assert body["course_name"] == "안전보건교육"
        # 원문 이름 노출 금지
        assert "홍길동" not in resp.text

    async def test_wrong_date_mismatch(self, client, db):
        cert, _ = await _issued_cert(client, db)
        resp = await _verify(client, cert.certificate_no, "2000-01-01")
        assert resp.status_code == 200
        body = resp.json()
        assert body["result"] == "mismatch"
        # 존재 누출 방지 — 확인서 정보 미노출
        assert body["certificate_no"] is None
        assert body["issued_name_masked"] is None

    async def test_unknown_no_not_found(self, client, db):
        resp = await _verify(client, "CERT-DOES-NOT-EXIST", "2026-01-01")
        assert resp.status_code == 200
        assert resp.json()["result"] == "not_found"

    async def test_revoked(self, client, db):
        cert, _ = await _issued_cert(client, db)
        _, admin_token = await make_admin(db)
        await db.commit()
        resp = await client.post(
            f"/api/certificates/{cert.id}/revoke",
            json={"reason": "오발급"},
            cookies=member_cookie(admin_token),
        )
        assert resp.status_code == 200

        verify = await _verify(client, cert.certificate_no, to_kst_date(cert.issued_at))
        assert verify.status_code == 200
        assert verify.json()["result"] == "revoked"


class TestLogging:
    async def test_every_attempt_logged_with_ip_hash(self, client, db):
        cert, _ = await _issued_cert(client, db)
        await _verify(client, cert.certificate_no, "2000-01-01")  # mismatch
        await _verify(client, "CERT-X", "2026-01-01")  # not_found
        await _verify(client, cert.certificate_no, to_kst_date(cert.issued_at))  # valid

        logs = (await db.execute(select(CertificateVerificationLog))).scalars().all()
        assert len(logs) == 3
        results = {log.result for log in logs}
        assert results == {"mismatch", "not_found", "valid"}
        # IP 는 해시로만 보관 — 원문 미저장
        for log in logs:
            assert log.requester_ip_hash
            assert len(log.requester_ip_hash) == 64
            assert log.requester_ip_hash != "127.0.0.1"
            assert "127.0.0.1" not in str(log.requester_ip_hash)


class TestRateLimit:
    async def test_11th_attempt_429(self, client, db):
        for _ in range(10):
            resp = await _verify(client, "CERT-X", "2026-01-01")
            assert resp.status_code == 200
        blocked = await _verify(client, "CERT-X", "2026-01-01")
        assert blocked.status_code == 429
        assert blocked.json()["code"] == "TOO_MANY_ATTEMPTS"
