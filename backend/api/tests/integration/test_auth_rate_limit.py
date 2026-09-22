"""통합 — 무인증 엔드포인트 rate limit (PASS 시작/완료, 관리자 가입).

in-memory limiter 상태는 conftest 가 테스트마다 초기화한다.
"""

from app.core.config import settings


class TestPassStartRateLimit:
    async def test_429_after_limit(self, client):
        for _ in range(settings.RATE_LIMIT_PASS_START_MAX):
            resp = await client.post(
                "/api/auth/pass", json={"identity_verification_id": "iv-1"}
            )
            assert resp.status_code != 429  # 미설정 503 등 다른 응답은 통과

        resp = await client.post(
            "/api/auth/pass", json={"identity_verification_id": "iv-1"}
        )
        assert resp.status_code == 429
        assert resp.json()["code"] == "TOO_MANY_ATTEMPTS"


class TestPassCompleteRateLimit:
    async def test_429_after_limit(self, client):
        for _ in range(settings.RATE_LIMIT_PASS_COMPLETE_MAX):
            resp = await client.post("/api/auth/pass/complete", json={"state": "x.y"})
            assert resp.status_code != 429

        resp = await client.post("/api/auth/pass/complete", json={"state": "x.y"})
        assert resp.status_code == 429
        assert resp.json()["code"] == "TOO_MANY_ATTEMPTS"


class TestRegisterRateLimit:
    async def test_429_after_limit(self, client):
        for i in range(settings.RATE_LIMIT_REGISTER_MAX):
            resp = await client.post(
                "/api/auth/register",
                json={
                    "email": f"not-allowed-{i}@example.com",
                    "password": "weak",
                    "name": "관리자",
                },
            )
            assert resp.status_code != 429

        resp = await client.post(
            "/api/auth/register",
            json={
                "email": "not-allowed-final@example.com",
                "password": "weak",
                "name": "관리자",
            },
        )
        assert resp.status_code == 429
        assert resp.json()["code"] == "TOO_MANY_ATTEMPTS"
