"""통합 — 문서번호(정감 제{YY}-E{NNNN}호): 발급 건당 1회 채번, 내역엔 번호가 없다."""


import re

from sqlalchemy import select

from app.core.kst import now_kst
from app.domain.certificate.model import Certificate, CertificateRequest
from app.domain.certificate.service import issuance_service
from app.domain.training_record.model import TrainingRecord
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


def _seq(doc_no: str) -> int:
    return int(doc_no.split("E")[1].removesuffix("호"))


async def _member(db, *, record_count=1, price=0, code="g-doc", seq=1):
    grade = await make_grade(db, code=code, name="문서번호등급")
    user, trainee = await make_trainee(
        db, grade.id, ci_raw=f"ci-{code}", trainee_no=f"TR-2026-{seq:04d}"
    )
    records = [
        await make_record(db, trainee.id, record_no=f"TRN-DOC-{code}-{index:04d}")
        for index in range(record_count)
    ]
    await make_pricing(db, grade.id, price_krw=price)
    token = await member_token(db, user)
    await db.commit()
    return user, trainee, records, token


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


class TestIssuanceEventNumbering:
    async def test_bundle_members_share_one_doc_no(self, client, db):
        """발급 이벤트(묶음)당 번호 1개 — 내역 3개를 한 번에 발급해도 번호는 하나."""
        _, _, records, token = await _member(db, record_count=3, code="g-share")
        resp = await _batch_request(client, token, records)
        assert resp.status_code == 201, resp.json()

        certs = await _issued_certs(db)
        assert len(certs) == 3
        doc_nos = {cert.doc_no for cert in certs}
        assert len(doc_nos) == 1
        yy = now_kst().strftime("%y")
        (doc_no,) = doc_nos
        assert re.fullmatch(rf"정감 제{yy}-E\d{{4}}호", doc_no)

        # WEB 발급 완료 화면이 me API 의 doc_no 로 문서번호를 인쇄한다
        mine = await client.get(
            "/api/me/certificates", cookies=member_cookie(token)
        )
        assert {row["doc_no"] for row in mine.json()} == doc_nos

    async def test_next_event_gets_next_number(self, client, db):
        """서로 다른 발급 이벤트는 순서가 증가한다 (숫자 비교 — E9 < E10)."""
        _, _, records_a, token_a = await _member(db, code="g-inc-a", seq=1)
        _, _, records_b, token_b = await _member(db, code="g-inc-b", seq=2)

        resp_a = await _batch_request(client, token_a, records_a)
        resp_b = await _batch_request(client, token_b, records_b)
        assert resp_a.status_code == 201 and resp_b.status_code == 201

        first, second = [c.doc_no for c in await _issued_certs(db)]
        assert _seq(second) == _seq(first) + 1

    async def test_record_has_no_doc_no(self, client, db):
        """내역엔 문서번호가 없다 — 등록 응답에도 키가 없다."""
        _, admin_token = await make_admin(db, email="norec-admin@example.com")
        _, trainee, _, _ = await _member(db, code="g-norec")
        resp = await client.post(
            "/api/training-records",
            json={
                "trainee_id": str(trainee.id),
                "course_id": None,
                "institution_id": None,
                "course_name": "직업안전보건교육",
                "institution_name": "카이사안전교육원",
                "total_hours": 8,
                "completed_hours": 8,
                "started_at": "2026-09-01",
                "ended_at": "2026-09-01",
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 201, resp.json()
        assert "doc_no" not in resp.json()
        assert not hasattr(TrainingRecord, "doc_no")


class TestReissueNumbering:
    async def test_reissue_gets_new_number_and_old_keeps_its_own(self, client, db):
        """재발급은 새 문서라 새 번호 — 이전 발급분은 구번호를 이력으로 유지한다."""
        _, _, records, token = await _member(db, record_count=2, code="g-reissue")
        resp = await _batch_request(client, token, records)
        assert resp.status_code == 201, resp.json()
        original_docs = {cert.doc_no for cert in await _issued_certs(db)}
        (original_doc,) = original_docs

        # 7일 내 재발급은 무료 — 내역 1개만 다시 발급 (발급 이벤트 1건 추가)
        resp = await _batch_request(
            client, token, records[:1], issue_type="reissue"
        )
        assert resp.status_code == 201, resp.json()

        certs = (
            (await db.execute(select(Certificate).order_by(Certificate.issued_at)))
            .scalars()
            .all()
        )
        assert len(certs) == 3
        # 재발급 시 이전 발급분은 superseded — 유효 건은 2 (남은 원본 1 + 재발급 1)
        superseded = [c for c in certs if c.status == "superseded"]
        assert len(superseded) == 1
        assert superseded[0].doc_no == original_doc  # 구번호는 이력으로 유지
        reissued = next(
            c
            for c in certs
            if c.status == "issued" and c.doc_no != original_doc
        )
        assert _seq(reissued.doc_no) == _seq(original_doc) + 1


class TestAdminIssue:
    async def test_admin_issue_saves_and_prints_doc_no(self, client, db):
        """어드민 발급은 결제 없이 저장 — 그룹(문서)당 번호 1개, WEB 에도 노출."""
        _, admin_token = await make_admin(db, email="doc-admin@example.com")
        user, trainee, records, token = await _member(
            db, record_count=2, code="g-admin", seq=3
        )
        resp = await client.post(
            "/api/certificates/issue",
            json={
                "groups": [
                    {
                        "trainee_id": str(trainee.id),
                        "record_ids": [str(r.id) for r in records],
                    }
                ]
            },
            cookies=admin_cookie(admin_token),
        )
        assert resp.status_code == 200, resp.json()

        (group,) = resp.json()["groups"]
        assert re.fullmatch(r"정감 제\d{2}-E\d{4}호", group["doc_no"])
        assert len(group["certificate_ids"]) == 2

        # 회원 신청 없는 어드민 발급 — 0원 · requested_by 로 user 연결 (WEB 노출)
        # status 는 WEB 0원 발급과 같이 issue_certificate 가 "issued" 로 마친다
        certs = await _issued_certs(db)
        assert {c.doc_no for c in certs} == {group["doc_no"]}
        requests_ = (
            (await db.execute(select(CertificateRequest))).scalars().all()
        )
        assert len(requests_) == 2
        assert {req.amount_krw for req in requests_} == {0}
        assert {req.requested_by for req in requests_} == {user.id}

        mine = await client.get("/api/me/certificates", cookies=member_cookie(token))
        rows = mine.json()
        assert len(rows) == 2
        assert {row["doc_no"] for row in rows} == {group["doc_no"]}

    async def test_admin_reissue_supersedes_previous(self, client, db):
        """기발급 내역도 새 문서에 그대로 발급된다 — 기존 확인서는 superseded.

        첫 발급 A(문서 1) → 두 번째 A~Z 선택이면 새 문서는 풀구성이고
        구 확인서는 구번호를 이력으로 유지한다.
        """
        _, admin_token = await make_admin(db, email="doc-admin2@example.com")
        _, trainee, records, token = await _member(
            db, record_count=2, code="g-reissue-admin", seq=4
        )
        body = {
            "groups": [
                {
                    "trainee_id": str(trainee.id),
                    "record_ids": [str(r.id) for r in records],
                }
            ]
        }
        first = await client.post(
            "/api/certificates/issue", json=body, cookies=admin_cookie(admin_token)
        )
        assert first.status_code == 200
        first_doc = first.json()["groups"][0]["doc_no"]

        second = await client.post(
            "/api/certificates/issue", json=body, cookies=admin_cookie(admin_token)
        )
        assert second.status_code == 200
        (group,) = second.json()["groups"]
        assert group["doc_no"] != first_doc
        assert len(group["certificate_ids"]) == 2

        certs = (
            (await db.execute(select(Certificate).order_by(Certificate.issued_at)))
            .scalars()
            .all()
        )
        assert len(certs) == 4
        superseded = [c for c in certs if c.status == "superseded"]
        assert {c.doc_no for c in superseded} == {first_doc}
        assert {c.doc_no for c in await _issued_certs(db)} == {group["doc_no"]}
        assert _seq(group["doc_no"]) == _seq(first_doc) + 1

        # WEB 발급내역엔 이력 포함 전체가 보인다 — 구번호도 유지
        mine = await client.get("/api/me/certificates", cookies=member_cookie(token))
        assert {row["doc_no"] for row in mine.json()} == {first_doc, group["doc_no"]}

    async def test_admin_issue_continues_web_numbering(self, client, db):
        """어드민 발급과 WEB 발급이 같은 채번열을 쓴다."""
        _, _, records_web, token_web = await _member(db, code="g-mix-web", seq=5)
        _, admin_token = await make_admin(db, email="doc-admin3@example.com")
        _, trainee_admin, records_admin, _ = await _member(
            db, code="g-mix-admin", seq=6
        )

        web = await _batch_request(client, token_web, records_web)
        admin_resp = await client.post(
            "/api/certificates/issue",
            json={
                "groups": [
                    {
                        "trainee_id": str(trainee_admin.id),
                        "record_ids": [str(r.id) for r in records_admin],
                    }
                ]
            },
            cookies=admin_cookie(admin_token),
        )
        assert web.status_code == 201 and admin_resp.status_code == 200

        certs = await _issued_certs(db)
        admin_doc = next(c.doc_no for c in certs if c.trainee_id == trainee_admin.id)
        docs = {c.doc_no for c in certs}
        assert len(docs) == 2
        web_doc = (docs - {admin_doc}).pop()
        assert _seq(admin_doc) == _seq(web_doc) + 1


class TestDocNoVerification:
    async def test_verify_by_doc_no_returns_bundle(self, client, db):
        """문서번호로 진위확인 — 확인서에 인쇄된 번호가 곧 조회 입력이다.

        응답 번호도 문서번호로 돌아온다(사용자가 입력한 그 번호).
        """
        _, _, records, token = await _member(db, record_count=2, code="g-verify")
        resp = await _batch_request(client, token, records)
        assert resp.status_code == 201, resp.json()

        (doc_no,) = {c.doc_no for c in await _issued_certs(db)}
        verify = await client.post(
            "/api/public/certificate-verifications",
            json={"certificate_no": doc_no},
        )
        assert verify.status_code == 200
        body = verify.json()
        assert body["result"] == "valid"
        assert body["kind"] == "certificate"
        assert body["certificate_no"] == doc_no
        assert len(body["records"]) == 2

    async def test_verify_accepts_bare_seq(self, client, db):
        """'26-E0001' 형태로도 조회 — 정감 제/호 감싸는 접두·접미는 서버가 붙인다."""
        _, _, records, token = await _member(db, record_count=1, code="g-bare")
        await _batch_request(client, token, records)

        (doc_no,) = {c.doc_no for c in await _issued_certs(db)}
        bare = doc_no.removeprefix("정감 제").removesuffix("호")
        verify = await client.post(
            "/api/public/certificate-verifications",
            json={"certificate_no": bare},
        )
        assert verify.status_code == 200
        body = verify.json()
        assert body["result"] == "valid"
        assert body["certificate_no"] == doc_no

    async def test_certificate_no_no_longer_lookup(self, client, db):
        """구 확인서 번호(CERT-…)는 조회 입력이 아니다 — 문서번호 형식만 받는다."""
        _, _, records, token = await _member(db, record_count=2, code="g-legacy")
        await _batch_request(client, token, records)

        certs = await _issued_certs(db)
        verify = await client.post(
            "/api/public/certificate-verifications",
            json={"certificate_no": certs[0].certificate_no},
        )
        assert verify.status_code == 200
        assert verify.json()["result"] == "not_found"


class TestFormatRule:
    def test_format_pads_seq_and_embeds_year(self):
        assert issuance_service.format_doc_no(1, "26") == "정감 제26-E0001호"
        assert issuance_service.format_doc_no(42, "27") == "정감 제27-E0042호"

    def test_year_reset_is_caller_responsibility(self):
        """연도가 바뀌면 순서는 E0001 리셋 — 연도는 호출부(채번 시점)가 정한다."""
        assert issuance_service.format_doc_no(1, "27") != issuance_service.format_doc_no(
            1, "26"
        )
