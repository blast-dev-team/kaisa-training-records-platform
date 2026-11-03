"""통합 — 문의함: 회원·비회원 작성/조회, 관리자 목록·답변·미해결 수·같은 문의자 묶음."""

from sqlalchemy import select

from app.core.crypto import decrypt_field, encrypt_field
from app.domain.audit.model import AuditLog
from app.domain.inquiry.model import Inquiry
from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_trainee,
    member_cookie,
    member_token,
)

BODY = {"category": "payment", "title": "환불 문의", "content": "결제 취소하고 싶어요"}


def guest_body(**overrides) -> dict:
    body = {
        **BODY,
        "name": "김비회",
        "phone": "010-1234-5678",
        "cert_no": "",
        "email": "",
        "password": "123456",
        "privacy_agreed": True,
    }
    body.update(overrides)
    return body


async def _member(db, *, ci_raw="ci-inq", name="홍회원", phone="01012345678"):
    grade = await make_grade(db, code=f"g-{ci_raw}", name=f"등급-{ci_raw}")
    user, trainee = await make_trainee(db, grade.id, ci_raw=ci_raw, name=name, trainee_no=f"TR-{ci_raw}")
    trainee.cert_no = "정보시스템감리협회 제100호"
    trainee.phone_encrypted = encrypt_field(phone)
    token = await member_token(db, user)
    return user, trainee, token


class TestMember:
    async def test_create_fills_author_from_trainee_and_lists_own_only(self, client, db):
        user, trainee, token = await _member(db)
        _, other, other_token = await _member(db, ci_raw="ci-other", name="남회원", phone="01099998888")
        await db.commit()

        resp = await client.post("/api/me/inquiries", json=BODY, cookies=member_cookie(token))
        assert resp.status_code == 201, resp.text
        await client.post(
            "/api/me/inquiries", json={**BODY, "title": "남의 문의"}, cookies=member_cookie(other_token)
        )

        row = (await db.execute(select(Inquiry).where(Inquiry.title == "환불 문의"))).scalar_one()
        assert row.user_id == user.id and row.trainee_id == trainee.id
        assert decrypt_field(row.author_name_encrypted) == "홍회원"
        assert decrypt_field(row.author_phone_encrypted) == "01012345678"
        assert row.author_cert_no == "정보시스템감리협회 제100호"
        assert row.password_hash is None

        listed = await client.get("/api/me/inquiries", cookies=member_cookie(token))
        assert [i["title"] for i in listed.json()] == ["환불 문의"]

    async def test_requires_login(self, client, db):
        resp = await client.post("/api/me/inquiries", json=BODY)
        assert resp.status_code == 401


class TestGuest:
    async def test_create_and_lookup_with_password(self, client, db):
        resp = await client.post("/api/public/inquiries", json=guest_body())
        assert resp.status_code == 201, resp.text
        row = (await db.execute(select(Inquiry))).scalar_one()
        assert row.user_id is None
        assert row.password_hash and "123456" not in row.password_hash
        assert row.author_cert_no is None and row.author_email is None

        ok = await client.post(
            "/api/public/inquiries/lookup",
            json={"name": "김비회", "phone": "01012345678", "password": "123456"},
        )
        assert ok.status_code == 200, ok.text
        assert [i["title"] for i in ok.json()] == ["환불 문의"]

    async def test_lookup_wrong_password_is_generic_404(self, client, db):
        await client.post("/api/public/inquiries", json=guest_body())
        resp = await client.post(
            "/api/public/inquiries/lookup",
            json={"name": "김비회", "phone": "01012345678", "password": "9999"},
        )
        assert resp.status_code == 404
        assert "일치하는 문의가 없어요" in resp.json()["message"]

    async def test_lookup_rate_limited_after_failures(self, client, db):
        for _ in range(10):
            await client.post(
                "/api/public/inquiries/lookup",
                json={"name": "없음", "phone": "01000000000", "password": "0000"},
            )
        resp = await client.post(
            "/api/public/inquiries/lookup",
            json={"name": "없음", "phone": "01000000000", "password": "0000"},
        )
        assert resp.status_code == 429

    async def test_privacy_consent_and_password_rules(self, client, db):
        no_consent = await client.post("/api/public/inquiries", json=guest_body(privacy_agreed=False))
        assert no_consent.status_code == 422
        bad_pw = await client.post("/api/public/inquiries", json=guest_body(password="12ab"))
        assert bad_pw.status_code == 422
        too_short = await client.post("/api/public/inquiries", json=guest_body(password="12345"))
        assert too_short.status_code == 422

    async def test_honeypot_pretends_success_without_saving(self, client, db):
        resp = await client.post("/api/public/inquiries", json=guest_body(website="http://spam"))
        assert resp.status_code == 201
        assert (await db.execute(select(Inquiry))).scalars().all() == []


class TestAdmin:
    async def test_answer_updates_status_count_and_audit(self, client, db):
        admin, admin_token = await make_admin(db)
        await db.commit()
        await client.post("/api/public/inquiries", json=guest_body())
        await client.post("/api/public/inquiries", json=guest_body(title="두 번째"))

        count = await client.get("/api/inquiries/unresolved-count", cookies=admin_cookie(admin_token))
        assert count.json() == {"count": 2}

        listed = await client.get("/api/inquiries?status=open", cookies=admin_cookie(admin_token))
        assert listed.status_code == 200
        target = listed.json()["items"][0]
        assert target["is_member"] is False and target["author_name"] == "김비회"

        ans = await client.put(
            f"/api/inquiries/{target['id']}/answer",
            json={"answer": "환불 처리해 드렸어요"},
            cookies=admin_cookie(admin_token),
        )
        assert ans.status_code == 200, ans.text
        assert ans.json()["status"] == "answered"
        assert ans.json()["answered_by_name"] == "테스트 관리자"

        count = await client.get("/api/inquiries/unresolved-count", cookies=admin_cookie(admin_token))
        assert count.json() == {"count": 1}
        logs = (await db.execute(select(AuditLog).where(AuditLog.action == "inquiry.answered"))).scalars().all()
        assert len(logs) == 1

        # 비회원이 답변을 본다
        seen = await client.post(
            "/api/public/inquiries/lookup",
            json={"name": "김비회", "phone": "01012345678", "password": "123456"},
        )
        answered = [i for i in seen.json() if i["id"] == target["id"]][0]
        assert answered["answer"] == "환불 처리해 드렸어요"

    async def test_history_merges_member_and_guest_by_name_and_phone(self, client, db):
        _, admin_token = await make_admin(db)
        _, _, token = await _member(db, name="홍회원", phone="01012345678")
        await db.commit()
        # 로그인 전 비회원으로 남긴 문의 + 로그인 후 회원 문의 + 다른 사람
        await client.post(
            "/api/public/inquiries", json=guest_body(name="홍회원", title="로그인 전 문의")
        )
        await client.post("/api/me/inquiries", json={**BODY, "title": "회원 문의"}, cookies=member_cookie(token))
        await client.post(
            "/api/public/inquiries", json=guest_body(name="다른사람", title="남의 문의")
        )

        member_row = (await db.execute(select(Inquiry).where(Inquiry.title == "회원 문의"))).scalar_one()
        detail = await client.get(f"/api/inquiries/{member_row.id}", cookies=admin_cookie(admin_token))
        assert detail.status_code == 200, detail.text
        body = detail.json()
        assert body["is_member"] is True and body["trainee_no"] == "TR-ci-inq"
        assert [h["title"] for h in body["history"]] == ["로그인 전 문의"]

    async def test_admin_endpoints_require_admin(self, client, db):
        _, _, token = await _member(db)
        await db.commit()
        resp = await client.get("/api/inquiries", cookies=member_cookie(token))
        assert resp.status_code == 401


async def test_member_author_preview_matches_saved_info(client, db):
    _, _, token = await _member(db, name="홍회원", phone="01012345678")
    await db.commit()
    resp = await client.get("/api/me/inquiries/author", cookies=member_cookie(token))
    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "name": "홍회원",
        "cert_no": "정보시스템감리협회 제100호",
        "phone_masked": "010-****-5678",
    }


class TestGuestHardening:
    """보안 검수 반영 — 대입·DoS·우회 방어."""

    LOOKUP = {"name": "김비회", "phone": "01012345678", "password": "123456"}

    async def test_successful_lookups_also_count_toward_limit(self, client, db):
        await client.post("/api/public/inquiries", json=guest_body())
        for _ in range(10):
            ok = await client.post("/api/public/inquiries/lookup", json=self.LOOKUP)
            assert ok.status_code == 200
        blocked = await client.post("/api/public/inquiries/lookup", json=self.LOOKUP)
        assert blocked.status_code == 429

    async def test_target_limit_holds_across_ips(self, client, db):
        for i in range(10):
            await client.post(
                "/api/public/inquiries/lookup",
                json={**self.LOOKUP, "password": f"{i:04d}"},
                headers={"x-real-ip": f"10.0.0.{i}"},
            )
        blocked = await client.post(
            "/api/public/inquiries/lookup",
            json={**self.LOOKUP, "password": "9999"},
            headers={"x-real-ip": "10.0.0.200"},
        )
        assert blocked.status_code == 429

    async def test_honeypot_still_requires_consent(self, client, db):
        resp = await client.post(
            "/api/public/inquiries", json=guest_body(website="x", privacy_agreed=False)
        )
        assert resp.status_code == 422

    async def test_fullwidth_phone_matches_ascii_and_non_ascii_password_rejected(self, client, db):
        created = await client.post("/api/public/inquiries", json=guest_body(phone="０１０１２３４５６７８"))
        assert created.status_code == 201
        found = await client.post("/api/public/inquiries/lookup", json=self.LOOKUP)
        assert found.status_code == 200
        arabic = await client.post("/api/public/inquiries", json=guest_body(password="١٢٣٤٥٦"))
        assert arabic.status_code == 422


async def test_history_marks_unverified_name_phone_matches_and_audit_keeps_old_answer(client, db):
    _, admin_token = await make_admin(db)
    user, _, token = await _member(db, name="홍회원", phone="01012345678")
    await db.commit()
    await client.post("/api/me/inquiries", json={**BODY, "title": "회원 문의1"}, cookies=member_cookie(token))
    await client.post("/api/me/inquiries", json={**BODY, "title": "회원 문의2"}, cookies=member_cookie(token))
    await client.post("/api/public/inquiries", json=guest_body(name="홍회원", title="비회원 문의"))

    row = (await db.execute(select(Inquiry).where(Inquiry.title == "회원 문의2"))).scalar_one()
    detail = (await client.get(f"/api/inquiries/{row.id}", cookies=admin_cookie(admin_token))).json()
    assert {h["title"]: h["matched_by"] for h in detail["history"]} == {
        "회원 문의1": "account",
        "비회원 문의": "name_phone",
    }

    for text in ("첫 답변", "고친 답변"):
        await client.put(
            f"/api/inquiries/{row.id}/answer", json={"answer": text}, cookies=admin_cookie(admin_token)
        )
    edited = (
        await db.execute(select(AuditLog).where(AuditLog.action == "inquiry.answer_updated"))
    ).scalar_one()
    assert edited.before_data["answer"] == "첫 답변"
    assert edited.after_data["answer"] == "고친 답변"


async def test_admin_search_treats_percent_literally(client, db):
    _, admin_token = await make_admin(db)
    await db.commit()
    await client.post("/api/public/inquiries", json=guest_body(title="환불 100% 되나요"))
    await client.post("/api/public/inquiries", json=guest_body(title="다른 문의"))
    resp = await client.get("/api/inquiries?status=open&search=%25", cookies=admin_cookie(admin_token))
    assert [i["title"] for i in resp.json()["items"]] == ["환불 100% 되나요"]
