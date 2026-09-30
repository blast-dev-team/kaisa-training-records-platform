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


async def _batch_request(client, token, records):
    return await client.post(
        "/api/certificate-requests/batch",
        json={
            "items": [{"training_record_id": str(record.id)} for record in records]
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
            json={"training_record_id": str(records[0].id)},
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
        # 문서번호도 발급 이벤트당 1개 — 묶음 멤버 전부 같은 값
        assert len({cert.doc_no for cert in certs}) == 1

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
    async def test_admin_list_groups_by_issue_event(self, client, db):
        """어드민 목록 — 발급건 단위 1행. 묶음은 대표 1건 + record_count."""
        _, records, token = await _member(db, record_count=3)
        await _batch_request(client, token, records)

        _, admin_token = await make_admin(db)
        await db.commit()

        resp = await client.get(
            "/api/certificates", cookies=admin_cookie(admin_token)
        )
        assert resp.status_code == 200
        body = resp.json()
        # 교육이력 3행이 아니라 발급건 1행 — total 도 발급건 수
        assert body["total"] == 1
        (item,) = body["items"]
        assert item["record_count"] == 3
        # 대표는 연번순 첫 건 — 진위확인 단건 필드와 같은 출처
        certs = await _issued_certs(db)
        first_by_no = min(certs, key=lambda c: c.certificate_no)
        assert item["certificate_no"] == first_by_no.certificate_no
        assert item["course_name"] == first_by_no.course_name

        # 검색이 멤버 과정명에 걸려도 같은 발급건이 노출된다
        searched = await client.get(
            "/api/certificates",
            params={"search": first_by_no.course_name},
            cookies=admin_cookie(admin_token),
        )
        assert searched.json()["total"] == 1
        assert searched.json()["items"][0]["record_count"] == 3

    async def test_doc_no_returns_all_rows(self, client, db):
        """문서번호 진위확인 — 이력 N행 + 단건 필드는 첫 행 값."""
        _, records, token = await _member(db, record_count=3)
        await _batch_request(client, token, records)

        certs = await _issued_certs(db)
        resp = await _verify(client, certs[0].doc_no)
        assert resp.status_code == 200
        body = resp.json()
        assert body["result"] == "valid"
        assert body["course_name"] == certs[0].course_name
        assert len(body["records"]) == 3
        assert {row["course_name"] for row in body["records"]} == {
            cert.course_name for cert in certs
        }

    async def test_full_repeat_issue_keeps_old_document(self, client, db):
        """묶음 전체 다시 발급 — 새 문서(풀구성)와 원 문서가 모두 유효하다."""
        _, records, token = await _member(db, record_count=2)
        await _batch_request(client, token, records)
        certs = await _issued_certs(db)
        old_doc_no = certs[0].doc_no

        reissue = await client.post(
            "/api/certificate-requests/batch",
            json={
                "items": [{"training_record_id": str(r.id)} for r in records]
            },
            cookies=member_cookie(token),
        )
        assert reissue.status_code == 201, reissue.json()

        # 원 문서도 여전히 유효 — 재발급은 폐기를 수반하지 않는다
        old = await _verify(client, old_doc_no)
        assert old.status_code == 200
        assert old.json()["result"] == "valid"
        assert len(old.json()["records"]) == 2

        # 새 문서 번호로 조회 — 풀구성 2행
        new_certs = await _issued_certs(db)
        new_doc_no = next(c.doc_no for c in new_certs if c.doc_no != old_doc_no)
        new = await _verify(client, new_doc_no)
        assert new.json()["result"] == "valid"
        assert len(new.json()["records"]) == 2

    async def test_partial_repeat_issue_adds_independent_document(self, client, db):
        """부분 재발급 — 원 문서는 그대로 유효, 새 1건 문서가 추가된다."""
        _, records, token = await _member(db, record_count=2)
        await _batch_request(client, token, records)
        certs = await _issued_certs(db)
        old_doc_no = certs[0].doc_no

        reissue = await client.post(
            "/api/certificate-requests",
            json={"training_record_id": str(records[0].id)},
            cookies=member_cookie(token),
        )
        assert reissue.status_code == 201, reissue.json()

        # 원 문서 — 멤버 2행 그대로 유효
        old = await _verify(client, old_doc_no)
        assert old.status_code == 200
        assert old.json()["result"] == "valid"
        assert len(old.json()["records"]) == 2

        # 새 문서 — 재발급(반복 발급) 건 1행
        new_certs = await _issued_certs(db)
        new_doc_no = next(c.doc_no for c in new_certs if c.doc_no != old_doc_no)
        new = await _verify(client, new_doc_no)
        assert new.json()["result"] == "valid"
        assert len(new.json()["records"]) == 1


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

        verify = await _verify(client, certs[0].doc_no)
        assert verify.json()["result"] == "revoked"


class TestIssueSourceSeparation:
    """발급 경로 분리 — 어드민 발급과 회원 발급이 서로를 폐기하지 않는다."""

    async def test_admin_issue_keeps_member_cert_valid(self, client, db):
        """회원 발급 후 어드민이 같은 이력을 발급 — 회원본 유지, 둘 다 유효."""
        trainee, records, token = await _member(db, record_count=1, code="g-src-m")
        resp = await _batch_request(client, token, records)
        assert resp.status_code == 201, resp.json()
        # expire_all 후엔 sync 속성 접근이 greenlet 에러 — id 를 미리 캡처
        record_id = records[0].id
        trainee_id = trainee.id

        _, admin_token = await make_admin(db)
        await db.commit()
        admin_resp = await client.post(
            "/api/certificates/issue",
            json={
                "groups": [
                    {
                        "trainee_id": str(trainee_id),
                        "record_ids": [str(record_id)],
                    }
                ]
            },
            cookies=admin_cookie(admin_token),
        )
        assert admin_resp.status_code == 200, admin_resp.json()

        db.expire_all()
        certs = list(
            (
                await db.execute(
                    select(Certificate)
                    .where(Certificate.training_record_id == record_id)
                    .order_by(Certificate.issued_at)
                )
            )
            .scalars()
            .all()
        )
        assert len(certs) == 2
        assert {cert.status for cert in certs} == {"issued"}
        assert {cert.issue_source for cert in certs} == {"member", "admin"}

        # WEB 발급내역엔 어드민 복사본이 보이지 않는다 — 회원이 신청한 건만
        mine = await client.get("/api/me/certificates", cookies=member_cookie(token))
        rows = mine.json()
        assert len(rows) == 1
        assert rows[0]["certificate_no"] == certs[0].certificate_no

    async def test_member_can_issue_original_over_admin_copy(self, client, db):
        """어드민 발급분은 회원 권리 판정에서 무시 — 회원 original 신청 가능."""
        trainee, records, token = await _member(db, record_count=1, code="g-src-a")
        record_id = records[0].id
        _, admin_token = await make_admin(db)
        await db.commit()
        admin_resp = await client.post(
            "/api/certificates/issue",
            json={
                "groups": [
                    {
                        "trainee_id": str(trainee.id),
                        "record_ids": [str(record_id)],
                    }
                ]
            },
            cookies=admin_cookie(admin_token),
        )
        assert admin_resp.status_code == 200, admin_resp.json()

        # 어드민 발급분이 있어도 회원 original 신청은 차단되지 않는다
        resp = await _batch_request(client, token, records)
        assert resp.status_code == 201, resp.json()

        db.expire_all()
        certs = list(
            (
                await db.execute(
                    select(Certificate)
                    .where(Certificate.training_record_id == record_id)
                    .order_by(Certificate.issued_at)
                )
            )
            .scalars()
            .all()
        )
        assert len(certs) == 2
        assert {cert.status for cert in certs} == {"issued"}


class TestBackfillCompatibility:
    async def test_legacy_cert_without_bundle_behaves_single(self, client, db):
        """bundle_no 없는 구 데이터(방어) — 단건으로 동작한다."""
        _, records, token = await _member(db)
        resp = await client.post(
            "/api/certificate-requests",
            json={"training_record_id": str(records[0].id)},
            cookies=member_cookie(token),
        )
        assert resp.status_code == 201

        (cert,) = await _issued_certs(db)
        cert.bundle_no = None
        await db.commit()

        resp = await _verify(client, cert.doc_no)
        assert resp.status_code == 200
        body = resp.json()
        assert body["result"] == "valid"
        assert len(body["records"]) == 1
