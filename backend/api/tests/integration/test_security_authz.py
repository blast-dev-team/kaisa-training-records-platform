"""통합 — 보안 점검: 역할별 권한 우회·타인 데이터 접근(IDOR) 시도.

전 엔드포인트를 앱 라우트 테이블에서 직접 뽑아, 권한이 없는 주체로 호출했을 때
반드시 막히는지(401/403) 확인한다. 새 엔드포인트가 추가돼도 자동으로 점검 대상이 된다.
"""

import uuid

import pytest
from fastapi.routing import APIRoute
from sqlalchemy import func, select

from app.core.config import settings
from app.domain.certificate.model import Certificate
from app.main import app
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

# 로그인 없이 쓰는 게 정상인 엔드포인트 — 이 목록 밖은 전부 인증 필수여야 한다
PUBLIC = {
    ("GET", "/api/health"),
    ("GET", "/api/auth/me"),  # 비로그인 시 401 을 직접 응답
    ("GET", "/api/me/session"),  # 비로그인 시 401 을 직접 응답
    ("POST", "/api/me/session/extend"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/logout"),
    ("POST", "/api/auth/register"),
    ("POST", "/api/auth/pass"),
    ("POST", "/api/auth/pass/complete"),
    ("POST", "/api/auth/pass/kaisa-login"),
    ("POST", "/api/auth/pass/logout"),
    ("POST", "/api/payments/webhooks/portone"),  # 서명 검증으로 보호
    ("POST", "/api/public/certificate-verifications"),
    ("POST", "/api/public/inquiries"),
    ("POST", "/api/public/inquiries/lookup"),
    ("GET", "/scalar"),
}


def _flat(routes, prefix=""):
    for r in routes:
        if type(r).__name__ == "_IncludedRouter":
            pre = getattr(r.include_context, "prefix", "") or ""
            yield from _flat(r.original_router.routes, prefix + pre)
        elif isinstance(r, APIRoute):
            yield prefix + r.path, r


def _auth_level(route: APIRoute) -> str:
    names: set[str] = set()

    def walk(d):
        names.add(getattr(d.call, "__name__", ""))
        for s in d.dependencies:
            walk(s)

    walk(route.dependant)
    if "require_super" in names:
        return "super"
    if "require_admin" in names:
        return "admin"
    if names & {"get_current_user", "get_current_trainee"}:
        return "member"
    return "public"


def _endpoints(level: str | None = None) -> list[tuple[str, str]]:
    out = []
    for path, route in _flat(app.routes):
        for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
            if (method, path) in PUBLIC:
                continue
            if level is None or _auth_level(route) == level:
                # 경로 파라미터는 아무 uuid — 인증이 먼저 막아야 하므로 존재 여부와 무관
                concrete = path
                for name in route.param_convertors:
                    concrete = concrete.replace("{" + name + "}", str(uuid.uuid4()))
                out.append((method, concrete))
    return out


async def _call(client, method, path, cookies=None):
    return await client.request(method, path, json={}, cookies=cookies or {})


def test_every_non_public_endpoint_requires_auth_dependency():
    """인증 dependency 가 빠진 비공개 엔드포인트가 생기면 실패 — 신규 라우트 누락 방지."""
    unguarded = [
        (method, path)
        for path, route in _flat(app.routes)
        for method in route.methods - {"HEAD", "OPTIONS"}
        if (method, path) not in PUBLIC and _auth_level(route) == "public"
    ]
    assert unguarded == []


@pytest.mark.parametrize("method,path", _endpoints())
async def test_anonymous_is_rejected(client, method, path):
    resp = await _call(client, method, path)
    assert resp.status_code == 401, f"{method} {path} → {resp.status_code}"


class TestRoleEscalation:
    async def test_member_cannot_call_any_admin_endpoint(self, client, db):
        grade = await make_grade(db)
        user, _ = await make_trainee(db, grade.id, ci_raw="ci-esc")
        token = await member_token(db, user)
        await db.commit()
        leaked = []
        for method, path in _endpoints("admin") + _endpoints("super"):
            # 회원 토큰을 관리자 쿠키 이름에 넣는 변조까지 시도
            for cookies in (member_cookie(token), admin_cookie(token)):
                resp = await _call(client, method, path, cookies)
                if resp.status_code not in (401, 403):
                    leaked.append((method, path, resp.status_code))
        assert leaked == []

    async def test_admin_session_is_not_a_member_session(self, client, db):
        _, admin_token = await make_admin(db)
        await db.commit()
        leaked = []
        for method, path in _endpoints("member"):
            # 관리자 토큰을 회원 쿠키 이름에 넣어도 회원 API 는 열리지 않아야 한다
            resp = await _call(client, method, path, member_cookie(admin_token))
            if resp.status_code not in (401, 403):
                leaked.append((method, path, resp.status_code))
        assert leaked == []

    async def test_staff_admin_cannot_call_super_endpoints(self, client, db):
        _, token = await make_admin(db, email="staff@example.com", role="staff")
        await db.commit()
        leaked = []
        for method, path in _endpoints("super"):
            resp = await _call(client, method, path, admin_cookie(token))
            if resp.status_code != 403:
                leaked.append((method, path, resp.status_code))
        assert leaked == []

    async def test_disabled_admin_is_blocked_immediately(self, client, db):
        admin, token = await make_admin(db)
        admin.status = "disabled"
        await db.commit()
        resp = await client.get("/api/trainees", cookies=admin_cookie(token))
        assert resp.status_code in (401, 403)

    async def test_forged_session_token_rejected(self, client, db):
        for cookies in (
            member_cookie("forged-token"),
            admin_cookie("adm_forged-token"),
            {settings.ADMIN_SESSION_COOKIE_NAME: "adm_" + "0" * 64},
        ):
            assert (await client.get("/api/trainees", cookies=cookies)).status_code == 401
            assert (await client.get("/api/me/profile", cookies=cookies)).status_code == 401


async def _two_members(db):
    """A(공격자)·B(피해자) — 각자 수료 이력 1건, 0원 발급 단가."""
    grade = await make_grade(db, code="g-idor", name="IDOR등급")
    await make_pricing(db, grade.id, price_krw=0)
    user_a, trainee_a = await make_trainee(db, grade.id, ci_raw="ci-a", name="공격자", trainee_no="TR-A")
    user_b, trainee_b = await make_trainee(db, grade.id, ci_raw="ci-b", name="피해자", trainee_no="TR-B")
    rec_a = await make_record(db, trainee_a.id, record_no="TRN-A")
    rec_b = await make_record(db, trainee_b.id, record_no="TRN-B")
    token_a = await member_token(db, user_a)
    token_b = await member_token(db, user_b)
    await db.commit()
    return (trainee_a, rec_a, token_a), (trainee_b, rec_b, token_b)


class TestIdor:
    """회원 A 가 B 의 리소스 id 를 직접 넣어 접근하는 시도 — 전부 막혀야 한다."""

    async def test_cannot_preview_others_completion_certificate(self, client, db):
        (_, _, token_a), (_, rec_b, _) = await _two_members(db)
        resp = await client.get(
            "/api/me/completion-certificates/preview",
            params={"training_record_id": str(rec_b.id)},
            cookies=member_cookie(token_a),
        )
        assert resp.status_code in (403, 404)

    async def test_cannot_issue_completion_certificate_for_others_record(self, client, db):
        (_, _, token_a), (_, rec_b, _) = await _two_members(db)
        resp = await client.post(
            "/api/me/completion-certificates",
            json={"training_record_ids": [str(rec_b.id)]},
            cookies=member_cookie(token_a),
        )
        assert resp.status_code in (400, 403, 404, 422)

    async def test_cannot_get_price_for_others_record(self, client, db):
        (_, _, token_a), (_, rec_b, _) = await _two_members(db)
        resp = await client.get(
            "/api/me/certificate-price",
            params={"training_record_id": str(rec_b.id)},
            cookies=member_cookie(token_a),
        )
        assert resp.status_code in (403, 404)

    async def test_cannot_batch_request_certificate_for_others_record(self, client, db):
        (_, rec_a, token_a), (_, rec_b, _) = await _two_members(db)
        resp = await client.post(
            "/api/certificate-requests/batch",
            json={"items": [{"training_record_id": str(rec_a.id)}, {"training_record_id": str(rec_b.id)}]},
            cookies=member_cookie(token_a),
        )
        assert resp.status_code in (400, 403, 404, 422)
        issued = (await db.execute(select(func.count()).select_from(Certificate))).scalar_one()
        assert issued == 0

    async def test_cannot_mark_others_certificate_downloaded(self, client, db):
        (_, _, token_a), (_, rec_b, token_b) = await _two_members(db)
        # B 가 자기 확인서를 정상 발급
        issued = await client.post(
            "/api/certificate-requests",
            json={"training_record_id": str(rec_b.id)},
            cookies=member_cookie(token_b),
        )
        assert issued.status_code == 201, issued.text
        cert_id = issued.json()["certificate"]["id"]

        await client.post(
            f"/api/me/certificates/{cert_id}/downloaded", cookies=member_cookie(token_a)
        )
        # 설계상 남의 건은 조용히 무시(200) — 응답 코드가 아니라 B 의 기록이 안 바뀌었는지로 판정
        cert = await db.get(Certificate, uuid.UUID(cert_id))
        await db.refresh(cert)
        assert cert.download_count in (0, None)
        assert cert.downloaded_at is None

    async def test_others_certificate_not_listed(self, client, db):
        (_, _, token_a), (_, rec_b, token_b) = await _two_members(db)
        await client.post(
            "/api/certificate-requests",
            json={"training_record_id": str(rec_b.id)},
            cookies=member_cookie(token_b),
        )
        mine = await client.get("/api/me/certificates", cookies=member_cookie(token_a))
        assert mine.status_code == 200
        assert mine.json() == []

    async def test_record_list_ignores_injected_trainee_id(self, client, db):
        """클라이언트가 trainee_id 를 넣어도 무시되고 본인 것만 나온다."""
        (_, rec_a, token_a), (trainee_b, _, _) = await _two_members(db)
        resp = await client.get(
            "/api/me/training-records",
            params={"trainee_id": str(trainee_b.id)},
            cookies=member_cookie(token_a),
        )
        assert resp.status_code == 200
        assert [i["id"] for i in resp.json()["items"]] == [str(rec_a.id)]
