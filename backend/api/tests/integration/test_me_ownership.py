"""통합 — 회원 포털 스코프: 소유권(타인 리소스 404) + 발급 신청 게이트."""

from app.core.crypto import sha256_hex
from app.core.session import create_user_session
from app.domain.user.model import User
from tests.integration.helpers import (
    make_grade,
    make_pricing,
    make_record,
    make_trainee,
    member_cookie,
    member_token,
)


async def _member_with_record(
    db,
    *,
    name="홍길동",
    ci_raw="ci-a",
    trainee_no="TR-2026-0001",
    completion_status="completed",
    review_status="approved",
    grade_code=None,
):
    grade = await make_grade(
        db, code=grade_code or f"g-{ci_raw}", name=f"등급-{ci_raw}"
    )
    user, trainee = await make_trainee(
        db,
        grade.id,
        ci_raw=ci_raw,
        name=name,
        trainee_no=trainee_no,
        review_status=review_status,
    )
    record = await make_record(
        db,
        trainee.id,
        completion_status=completion_status,
        record_no=f"TRN-{trainee_no.split('-')[-1]}",
    )
    await make_pricing(db, grade.id)
    await make_pricing(db, grade.id, issue_type="reissue", price_krw=5000)
    token = await member_token(db, user)
    await db.commit()
    return user, trainee, record, token


class TestOwnership:
    async def test_my_record_visible(self, client, db):
        _, _, record, token = await _member_with_record(db)
        resp = await client.get(
            f"/api/me/training-records/{record.id}", cookies=member_cookie(token)
        )
        assert resp.status_code == 200
        assert resp.json()["course_name"] == "안전보건교육"

    async def test_others_record_404(self, client, db):
        _, _, _, token_a = await _member_with_record(
            db, name="A", ci_raw="ci-a", trainee_no="TR-2026-0001"
        )
        _, _, record_b, _ = await _member_with_record(
            db, name="B", ci_raw="ci-b", trainee_no="TR-2026-0002"
        )
        resp = await client.get(
            f"/api/me/training-records/{record_b.id}", cookies=member_cookie(token_a)
        )
        assert resp.status_code == 404

    async def test_unlinked_user_profile_403(self, client, db):
        orphan = User(ci_hash=sha256_hex("ci-orphan"), name="무소속")
        db.add(orphan)
        await db.flush()
        token = await create_user_session(db, orphan.id, "pass")
        resp = await client.get("/api/me/profile", cookies=member_cookie(token))
        assert resp.status_code == 403
        assert resp.json()["code"] == "TRAINEE_NOT_LINKED"

    async def test_others_certificate_request_404(self, client, db):
        # 신청 바디에 타인 training_record_id — 소유 검증 후 404
        _, _, _, token_a = await _member_with_record(
            db, name="A", ci_raw="ci-a", trainee_no="TR-2026-0001"
        )
        _, _, record_b, _ = await _member_with_record(
            db, name="B", ci_raw="ci-b", trainee_no="TR-2026-0002"
        )
        resp = await client.post(
            "/api/certificate-requests",
            json={"training_record_id": str(record_b.id), "issue_type": "original"},
            cookies=member_cookie(token_a),
        )
        assert resp.status_code == 404


class TestRequestGates:
    async def test_incomplete_record_rejected(self, client, db):
        _, _, record, token = await _member_with_record(
            db, completion_status="in_progress"
        )
        resp = await client.post(
            "/api/certificate-requests",
            json={"training_record_id": str(record.id), "issue_type": "original"},
            cookies=member_cookie(token),
        )
        assert resp.status_code in (400, 422)

    async def test_grade_not_determined_rejected(self, client, db):
        _, _, record, token = await _member_with_record(db, review_status="unverified")
        resp = await client.post(
            "/api/certificate-requests",
            json={"training_record_id": str(record.id), "issue_type": "original"},
            cookies=member_cookie(token),
        )
        assert resp.status_code == 409
        assert resp.json()["code"] == "GRADE_NOT_DETERMINED"

    async def test_no_pricing_rule_rejected(self, client, db):
        grade = await make_grade(db, code="noprice", name="무가격", sort_order=9)
        user, trainee = await make_trainee(
            db, grade.id, ci_raw="ci-noprice", trainee_no="TR-2026-0009"
        )
        record = await make_record(db, trainee.id)
        token = await member_token(db, user)
        await db.commit()
        resp = await client.post(
            "/api/certificate-requests",
            json={"training_record_id": str(record.id), "issue_type": "original"},
            cookies=member_cookie(token),
        )
        assert resp.status_code == 409
        assert resp.json()["code"] == "PRICING_RULE_NOT_FOUND"

    async def test_profile_phone_masked(self, client, db):
        _, _, _, token = await _member_with_record(db)
        resp = await client.get("/api/me/profile", cookies=member_cookie(token))
        assert resp.status_code == 200
        body = resp.json()
        # 전화번호는 항상 마스킹 — 원문 노출 금지
        assert body["phone_masked"] == "010-****-5678"
        assert "01012345678" not in resp.text
