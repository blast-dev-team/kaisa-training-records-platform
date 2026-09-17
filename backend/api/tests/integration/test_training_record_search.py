"""통합 — 감리교육 이력 목록 검색 (과정명·기관명·교육생 성명)."""

from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_record,
    make_trainee,
)


class TestTrainingRecordSearch:
    async def test_search_matches_course_institution_and_trainee_name(self, client, db):
        grade = await make_grade(db, code="g-search", name="검색등급")
        _, trainee_a = await make_trainee(
            db, grade.id, ci_raw="ci-search-a", name="김안전", trainee_no="TR-2026-0201"
        )
        _, trainee_b = await make_trainee(
            db, grade.id, ci_raw="ci-search-b", name="이소방", trainee_no="TR-2026-0202"
        )
        await make_record(db, trainee_a.id, record_no="TRN-SEARCH-0001")
        rec2 = await make_record(
            db, trainee_b.id, record_no="TRN-SEARCH-0002"
        )
        rec2.course_name = "비파괴검사 계속교육"
        rec2.institution_name = "한국감리협회"
        await db.flush()
        _, admin_token = await make_admin(db)
        await db.commit()

        def ids(resp):
            assert resp.status_code == 200
            return {i["training_record_no"] for i in resp.json()["items"]}

        # 과정명
        assert ids(
            await client.get(
                "/api/training-records?search=비파괴", cookies=admin_cookie(admin_token)
            )
        ) == {"TRN-SEARCH-0002"}
        # 기관명
        assert ids(
            await client.get(
                "/api/training-records?search=한국감리", cookies=admin_cookie(admin_token)
            )
        ) == {"TRN-SEARCH-0002"}
        # 교육생 성명
        assert ids(
            await client.get(
                "/api/training-records?search=김안전", cookies=admin_cookie(admin_token)
            )
        ) == {"TRN-SEARCH-0001"}
        # 빈 검색 = 전체
        all_ids = ids(
            await client.get("/api/training-records", cookies=admin_cookie(admin_token))
        )
        assert all_ids == {"TRN-SEARCH-0001", "TRN-SEARCH-0002"}
