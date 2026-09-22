"""통합 — 묶음 확인서: 한 발급 이벤트 = 묶음 번호 1개, 진위확인 전체 행 반환."""


from sqlalchemy import select

from app.domain.certificate.model import Certificate
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


async def _member(db, *, record_count=1, price=0, code="g-bundle"):
    grade = await make_grade(db, code=code, name="묶음등급")
    user, trainee = await make_trainee(
        db, grade.id, ci_raw=f"ci-{code}", trainee_no=f"TR-2026-{code[-4:]}"
    )
    records = [
        await make_record(db, trainee.id, record_no=f"TRN-BNDL-{index:04d}")
        for index in range(record_count)
    ]
    await make_pricing(db, grade.id, price_krw=price)
    token = await member_token(db, user)
    await db.commit()
    return trainee, records, token


async def _batch_request(client, token, records, issue_type="original"):
    return await client.post(
        "/api/certificate-requests/batch",
        json={
            "items": [
                {"training_record_id": str(record.id), "issue_type": issue_type}
                for record in records
            ]
        },
        cookies=member_cookie(token),
    )


async def _issued_certs(db) -> list[Certificate]:
    return list(
        (
            await db.execute(
                select(Certificate)
                .where(Certificate.status == "issued")
                .order_by(Certificate.issued_at, Certificate.id)
            )
        )
        .scalars()
        .all()
    )


async def _verify(client, cert_no: str):
    return await client.post(
        "/api/public/certificate-verifications",
        json={"certificate_no": cert_no},
    )


class TestBundleNo:
    async def test_single_issue_bundle_equals_own_no(self, client, db):
        """단건 발급도 묶음 1건 — bundle_no == certificate_no."""
        _, records, token = await _member(db)
        resp = await client.post(
            "/api/certificate-requests",
            json={
                "training_record_id": str(records[0].id),
                "issue_type": "original",
            },
            cookies=member_cookie(token),
        )
        assert resp.status_code == 201

        (cert,) = await _issued_certs(db)
        assert cert.bundle_no == cert.certificate_no

        # me API 가 bundle_no 를 내려주는지 — WEB 발급 완료 화면이 이 필드로 묶음을 만든다
        mine = await client.get(
            "/api/me/certificates", cookies=member_cookie(token)
        )
        assert mine.json()[0]["bundle_no"] == cert.bundle_no

    async def test_zero_price_batch_shares_first_no(self, client, db):
        """0원 일괄 발급 — N건 전부 같은 묶음 번호(첫 확인서 번호)."""
        _, records, token = await _member(db, record_count=3)
        resp = await _batch_request(client, token, records)
        assert resp.status_code == 201, resp.json()

        certs = await _issued_certs(db)
        assert len(certs) == 3
        bundle_nos = {cert.bundle_no for cert in certs}
        assert len(bundle_nos) == 1
        assert certs[0].bundle_no == certs[0].certificate_no
        # 묶음 번호는 멤버 중 하나의 확인서 번호 — 별도 채번 아님
        assert certs[0].bundle_no in {cert.certificate_no for cert in certs}

    async def test_paid_batch_confirm_shares_first_no(self, client, db, monkeypatch):
        from app.integrations import portone
        from tests.integration.helpers import portone_payment

        async def fake_get(payment_id):
            return portone_payment(payment_id, total=5000)

        monkeypatch.setattr(portone, "get_payment", fake_get)
        _, records, token = await _member(db, record_count=2, price=5000)
        resp = await _batch_request(client, token, records)
        assert resp.status_code == 201
        order_no = resp.json()[0]["order_no"]

        confirm = await client.post(
            f"/api/payments/{order_no}/confirm", cookies=member_cookie(token)
        )
        assert confirm.status_code == 200

        certs = await _issued_certs(db)
        assert len(certs) == 2
        assert certs[0].bundle_no == certs[1].bundle_no == certs[0].certificate_no


class TestBundleVerification:
    async def test_bundle_no_returns_all_rows(self, client, db):
        """묶음 번호 진위확인 — 이력 N행 + 단건 필드는 첫 행 값."""
        _, records, token = await _member(db, record_count=3)
        await _batch_request(client, token, records)

        certs = await _issued_certs(db)
        resp = await _verify(client, certs[0].bundle_no)
        assert resp.status_code == 200
        body = resp.json()
        assert body["result"] == "valid"
        assert body["course_name"] == certs[0].course_name
        assert len(body["records"]) == 3
        assert {row["course_name"] for row in body["records"]} == {
            cert.course_name for cert in certs
        }

    async def test_member_no_returns_whole_bundle(self, client, db):
        """묶음 멤버 개별 번호로도 검색 가능 — 같은 묶음이 반환된다."""
        _, records, token = await _member(db, record_count=2)
        await _batch_request(client, token, records)

        certs = await _issued_certs(db)
        member = certs[1]
        resp = await _verify(client, member.certificate_no)
        assert resp.status_code == 200
        assert len(resp.json()["records"]) == 2

    async def test_superseded_member_excluded(self, client, db):
        """재발급 supersede — 이전 묶음 조회에서 제외되고 새 묶음이 생긴다."""
        _, records, token = await _member(db, record_count=2)
        await _batch_request(client, token, records)
        certs = await _issued_certs(db)
        old_bundle_no = certs[0].bundle_no

        reissue = await client.post(
            "/api/certificate-requests",
            json={
                "training_record_id": str(records[0].id),
                "issue_type": "reissue",
            },
            cookies=member_cookie(token),
        )
        assert reissue.status_code == 201, reissue.json()

        # 이전 묶음 번호로 조회 — 재발급된 건은 빠진 나머지 1행
        old = await _verify(client, old_bundle_no)
        assert old.status_code == 200
        assert old.json()["result"] == "valid"
        assert len(old.json()["records"]) == 1

        # 새 묶음 — 1건짜리
        (new_cert,) = [
            cert
            for cert in await _issued_certs(db)
            if cert.bundle_no != old_bundle_no
        ]
        fresh = await _verify(client, new_cert.bundle_no)
        assert len(fresh.json()["records"]) == 1


class TestBundleRevoke:
    async def test_revoke_revokes_whole_bundle(self, client, db):
        """묶음 폐기 — 번호가 하나라 전 멤버가 함께 폐기된다."""
        _, records, token = await _member(db, record_count=2)
        await _batch_request(client, token, records)
        certs = await _issued_certs(db)
        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.post(
            f"/api/certificates/{certs[0].id}/revoke",
            json={"reason": "오발급"},
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200

        # API 세션 커밋분을 다시 읽게 한다 — 위에서 로드한 객체가 identity map 에 있음
        db.expire_all()
        all_certs = (
            (await db.execute(select(Certificate))).scalars().all()
        )
        assert all(cert.status == "revoked" for cert in all_certs)

        verify = await _verify(client, certs[0].bundle_no)
        assert verify.json()["result"] == "revoked"


class TestBackfillCompatibility:
    async def test_legacy_cert_without_bundle_behaves_single(self, client, db):
        """bundle_no 없는 구 데이터(방어) — 단건으로 동작한다."""
        _, records, token = await _member(db)
        resp = await client.post(
            "/api/certificate-requests",
            json={
                "training_record_id": str(records[0].id),
                "issue_type": "original",
            },
            cookies=member_cookie(token),
        )
        assert resp.status_code == 201

        (cert,) = await _issued_certs(db)
        cert.bundle_no = None
        await db.commit()

        resp = await _verify(client, cert.certificate_no)
        assert resp.status_code == 200
        body = resp.json()
        assert body["result"] == "valid"
        assert len(body["records"]) == 1
