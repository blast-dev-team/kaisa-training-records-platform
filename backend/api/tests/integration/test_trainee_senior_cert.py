"""통합 — 수석감리원증번호(senior_cert_no) 이원화.

감리원 등급은 요청으로 받지 않고 번호 유무에서 파생된다:
- senior_cert_no 있음 → 수석감리원
- 수석이던 사람이 senior_cert_no 를 지우면 감리원으로 강등
- 감리원증번호만 있으면 감리원, 둘 다 없으면 미지정(NULL)
"""

from app.domain.trainee.model import Trainee
from tests.integration.helpers import admin_cookie, make_admin


def _trainee(grade: str | None, senior_no: str | None, cert_no: str | None) -> Trainee:
    t = Trainee(
        name_encrypted="x",
        name_hash="x",
        supervisor_grade=grade,
        senior_cert_no=senior_no,
        cert_no=cert_no,
    )
    return t


class TestCurrentSupervisorCertNo:
    """확인서·교육이력 표기 번호 — 현재 등급의 번호를 고른다."""

    def test_senior_shows_senior_cert_no(self):
        t = _trainee("수석감리원", "수석 제1호", "제1호")
        assert t.current_supervisor_cert_no == "수석 제1호"

    def test_supervisor_shows_cert_no(self):
        t = _trainee("감리원", None, "제1호")
        assert t.current_supervisor_cert_no == "제1호"

    def test_senior_without_senior_no_falls_back(self):
        # 수석인데 수석번호 미입력 — 빈 확인서보다 기존 번호 노출이 안전
        t = _trainee("수석감리원", None, "제1호")
        assert t.current_supervisor_cert_no == "제1호"



async def _admin(db):
    _, token = await make_admin(db)
    return admin_cookie(token)


class TestSupervisorGradeDerivation:
    async def test_create_with_senior_cert_promotes(self, client, db):
        cookie = await _admin(db)
        resp = await client.post(
            "/api/trainees",
            json={
                "name": "김수석",
                "cert_no": "제1호",
                "senior_cert_no": "수석 제1호",
            },
            cookies=cookie,
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["cert_no"] == "제1호"
        assert body["senior_cert_no"] == "수석 제1호"
        assert body["supervisor_grade"] == "수석감리원"

    async def test_create_cert_only_is_supervisor(self, client, db):
        cookie = await _admin(db)
        resp = await client.post(
            "/api/trainees",
            json={"name": "김감리", "cert_no": "제2호"},
            cookies=cookie,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["supervisor_grade"] == "감리원"

    async def test_create_without_cert_is_unassigned(self, client, db):
        cookie = await _admin(db)
        resp = await client.post(
            "/api/trainees",
            json={"name": "김미지정"},
            cookies=cookie,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["supervisor_grade"] is None

    async def test_patch_senior_cert_promotes_and_keeps_cert(self, client, db):
        cookie = await _admin(db)
        created = await client.post(
            "/api/trainees",
            json={"name": "박승격", "cert_no": "제3호"},
            cookies=cookie,
        )
        tid = created.json()["id"]
        resp = await client.patch(
            f"/api/trainees/{tid}",
            json={"senior_cert_no": "수석 제3호"},
            cookies=cookie,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # 기존 감리원증번호는 유지되고 수석번호가 추가된다 — 이번 변경의 핵심
        assert body["cert_no"] == "제3호"
        assert body["senior_cert_no"] == "수석 제3호"
        assert body["supervisor_grade"] == "수석감리원"

    async def test_patch_clearing_senior_cert_demotes(self, client, db):
        cookie = await _admin(db)
        created = await client.post(
            "/api/trainees",
            json={
                "name": "이강등",
                "cert_no": "제4호",
                "senior_cert_no": "수석 제4호",
            },
            cookies=cookie,
        )
        tid = created.json()["id"]
        resp = await client.patch(
            f"/api/trainees/{tid}",
            json={"senior_cert_no": None},
            cookies=cookie,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["cert_no"] == "제4호"
        assert body["senior_cert_no"] is None
        assert body["supervisor_grade"] == "감리원"

    async def test_patch_name_only_keeps_grade(self, client, db):
        cookie = await _admin(db)
        created = await client.post(
            "/api/trainees",
            json={
                "name": "이강등",
                "cert_no": "제4호",
                "senior_cert_no": "수석 제4호",
            },
            cookies=cookie,
        )
        tid = created.json()["id"]
        resp = await client.patch(
            f"/api/trainees/{tid}",
            json={"name": "새이름"},
            cookies=cookie,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # 번호를 건드리지 않는 수정에서 등급이 바뀌면 안 된다
        assert body["supervisor_grade"] == "수석감리원"

    async def test_bulk_update_senior_cert_promotes(self, client, db):
        cookie = await _admin(db)
        created = await client.post(
            "/api/trainees",
            json={"name": "정일괄", "cert_no": "제5호"},
            cookies=cookie,
        )
        tid = created.json()["id"]
        resp = await client.post(
            "/api/trainees/bulk-update",
            json={"items": [{"id": tid, "senior_cert_no": "수석 제5호"}]},
            cookies=cookie,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["updated"] == 1
        detail = await client.get(f"/api/trainees/{tid}", cookies=cookie)
        body = detail.json()
        assert body["senior_cert_no"] == "수석 제5호"
        assert body["supervisor_grade"] == "수석감리원"

    async def test_requested_grade_respected_without_senior(self, client, db):
        cookie = await _admin(db)
        # 미지정 선택 + 감리원증번호 — 선택값을 존중해 미지정 유지
        resp = await client.post(
            "/api/trainees",
            json={"name": "미지정선택", "cert_no": "제6호", "supervisor_grade": None},
            cookies=cookie,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["supervisor_grade"] is None

    async def test_senior_cert_forces_grade_over_request(self, client, db):
        cookie = await _admin(db)
        # 수석번호가 있으면 등급 선택과 무관하게 수석감리원 강제
        resp = await client.post(
            "/api/trainees",
            json={
                "name": "강제수석",
                "cert_no": "제7호",
                "senior_cert_no": "수석 제7호",
                "supervisor_grade": "감리원",
            },
            cookies=cookie,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["supervisor_grade"] == "수석감리원"

    async def test_senior_request_without_cert_defended_to_supervisor(self, client, db):
        cookie = await _admin(db)
        # 수석번호 없이 수석감리원 요청 — 감리원으로 방어
        resp = await client.post(
            "/api/trainees",
            json={
                "name": "방어수석",
                "cert_no": "제8호",
                "supervisor_grade": "수석감리원",
            },
            cookies=cookie,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["supervisor_grade"] == "감리원"

    async def test_patch_grade_selection_changes_grade(self, client, db):
        cookie = await _admin(db)
        created = await client.post(
            "/api/trainees",
            json={"name": "선택변경", "cert_no": "제9호", "supervisor_grade": "감리원"},
            cookies=cookie,
        )
        tid = created.json()["id"]
        # 등급 선택만 변경 — 번호를 건드리지 않는데도 등급이 바뀐다
        resp = await client.patch(
            f"/api/trainees/{tid}",
            json={"supervisor_grade": None},
            cookies=cookie,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["supervisor_grade"] is None
