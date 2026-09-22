"""통합 — 공개 진위확인: 인증 없음, 마스킹, 로그(IP 해시), rate limit."""

from sqlalchemy import select

from app.domain.certificate.model import Certificate, CertificateVerificationLog
from tests.integration.helpers import (
    admin_cookie,
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


async def _verify(client, cert_no: str):
    return await client.post(
        "/api/public/certificate-verifications",
        json={"certificate_no": cert_no},
    )


class TestVerify:
    async def test_valid_masked(self, client, db):
        cert, _ = await _issued_cert(client, db)
        resp = await _verify(client, cert.certificate_no)
        assert resp.status_code == 200
        body = resp.json()
        assert body["result"] == "valid"
        assert body["certificate_no"] == cert.certificate_no
        assert body["issued_name_masked"] == "홍**"
        assert body["course_name"] == "안전보건교육"
        assert body["total_hours"] == "16.00"
        assert body["training_ended_at"] == (
            cert.training_ended_at.isoformat() if cert.training_ended_at else None
        )
        # 원문 이름 노출 금지
        assert "홍길동" not in resp.text

    async def test_name_not_checked(self, client, db):
        """데모 단계 — 성명 일치와 무관하게 확인 가능 (요청에 성명 필드가 없다)."""
        cert, _ = await _issued_cert(client, db)
        for name in ("홍길동", "아무개", "x"):
            resp = await client.post(
                "/api/public/certificate-verifications",
                json={"certificate_no": cert.certificate_no, "applicant_name": name},
            )
            assert resp.status_code == 200
            assert resp.json()["result"] == "valid"

    async def test_unknown_no_not_found(self, client, db):
        resp = await _verify(client, "CERT-DOES-NOT-EXIST")
        assert resp.status_code == 200
        assert resp.json()["result"] == "not_found"

    async def test_revoked(self, client, db):
        cert, _ = await _issued_cert(client, db)
        _, admin_token = await make_admin(db)
        await db.commit()
        resp = await client.post(
            f"/api/certificates/{cert.id}/revoke",
            json={"reason": "오발급"},
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200

        verify = await _verify(client, cert.certificate_no)
        assert verify.status_code == 200
        assert verify.json()["result"] == "revoked"


class TestLogging:
    async def test_every_attempt_logged_with_ip_hash(self, client, db):
        cert, _ = await _issued_cert(client, db)
        await _verify(client, "CERT-X")  # not_found
        await _verify(client, cert.certificate_no)  # valid

        logs = (await db.execute(select(CertificateVerificationLog))).scalars().all()
        assert len(logs) == 2
        results = {log.result for log in logs}
        assert results == {"not_found", "valid"}
        # IP 는 해시로만 보관 — 원문 미저장
        for log in logs:
            assert log.requester_ip_hash
            assert len(log.requester_ip_hash) == 64
            assert log.requester_ip_hash != "127.0.0.1"
            assert "127.0.0.1" not in str(log.requester_ip_hash)


class TestRateLimit:
    async def test_11th_attempt_429(self, client, db):
        for _ in range(10):
            resp = await _verify(client, "CERT-X")
            assert resp.status_code == 200
        blocked = await _verify(client, "CERT-X")
        assert blocked.status_code == 429
        assert blocked.json()["code"] == "TOO_MANY_ATTEMPTS"
