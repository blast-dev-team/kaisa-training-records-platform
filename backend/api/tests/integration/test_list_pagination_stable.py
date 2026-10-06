"""통합 - 목록 페이지네이션 안정성 테스트.

이관 데이터는 created_at / started_at 이 일괄 반영되어 같은 값이 수천 건이다.
정렬 tiebreaker(id)가 없으면 LIMIT/OFFSET 사이에 같은 행이 여러 페이지에
걸쳐 나타난다 (2026-09-29 감리원 목록에서 10건 중 4건이 1·2페이지에 동시
출현 확인). 다중선택 유지와 조합되면 선택하지 않은 행이 체크돼 보이는
버그가 되므로, id tiebreaker 추가로 회귀를 막는다.
"""

from datetime import date, datetime

from app.core.kst import KST
from tests.integration.helpers import (
    admin_cookie,
    make_admin,
    make_grade,
    make_record,
    make_trainee,
)

# 이관 시각 - 실데이터와 같은 형태: 한 시점에 수천 건이 같은 created_at 을 갖는다
MIGRATION_STAMP = datetime(2026, 5, 31, tzinfo=KST)


async def _admin(db):
    _, token = await make_admin(db)
    return admin_cookie(token)


async def _make_trainees(db):
    grade = await make_grade(db, code="g-pag", name="페이지등급")
    trainees = []
    for i in range(5):
        _, trainee = await make_trainee(
            db, grade.id, ci_raw=f"ci-pag-{i}", trainee_no=f"TR-PAG-{i}"
        )
        trainee.created_at = MIGRATION_STAMP
        trainees.append(trainee)
    await db.commit()
    return trainees


class TestTraineeListPagination:
    async def test_same_created_at_rows_do_not_overlap_pages(self, client, db):
        trainees = await _make_trainees(db)
        cookie = await _admin(db)

        seen = []
        for page, expected in ((1, 2), (2, 2), (3, 1)):
            resp = await client.get(
                "/api/trainees",
                params={"page": page, "limit": 2},
                cookies=cookie,
            )
            assert resp.status_code == 200, resp.text
            items = resp.json()["items"]
            assert len(items) == expected
            seen.extend(i["trainee_no"] for i in items)

        assert len(seen) == len(set(seen))
        assert set(seen) == {t.trainee_no for t in trainees}

        # 같은 created_at 묶음 안에서의 순서 규칙은 id 내림차순으로 정해져 있다 —
        # tiebreaker 가 없으면 이 순서가 쿼리마다 달라져 페이지가 흔들린다
        by_id_desc = sorted(trainees, key=lambda t: t.id, reverse=True)
        assert seen == [t.trainee_no for t in by_id_desc]


class TestTrainingRecordListPagination:
    async def _setup(self, db, created_at):
        grade = await make_grade(db, code="g-pag-r", name="페이지등급R")
        _, trainee = await make_trainee(
            db, grade.id, ci_raw="ci-pag-rec", trainee_no="TR-PAG-REC"
        )
        records = []
        for i in range(5):
            record = await make_record(db, trainee.id, record_no=f"TRN-PAG-{i}")
            record.started_at = date(2026, 1, 1)
            record.created_at = created_at
            records.append(record)
        await db.commit()
        return records

    async def test_period_sort_pages_do_not_overlap(self, client, db):
        records = await self._setup(db, MIGRATION_STAMP)
        cookie = await _admin(db)

        seen = []
        for page, expected in ((1, 2), (2, 2), (3, 1)):
            resp = await client.get(
                "/api/training-records",
                params={"page": page, "limit": 2},
                cookies=cookie,
            )
            assert resp.status_code == 200, resp.text
            items = resp.json()["items"]
            assert len(items) == expected
            seen.extend(i["training_record_no"] for i in items)

        # 같은 started_at·created_at 묶음 안의 순서 규칙은 id 내림차순이다
        by_id_desc = sorted(records, key=lambda r: r.id, reverse=True)
        assert seen == [r.training_record_no for r in by_id_desc]

    async def test_registration_sort_pages_do_not_overlap(self, client, db):
        records = await self._setup(db, datetime(2026, 9, 15, tzinfo=KST))
        cookie = await _admin(db)

        seen = []
        for page, expected in ((1, 2), (2, 2), (3, 1)):
            resp = await client.get(
                "/api/training-records",
                params={"page": page, "limit": 2, "sort": "registration"},
                cookies=cookie,
            )
            assert resp.status_code == 200, resp.text
            items = resp.json()["items"]
            assert len(items) == expected
            seen.extend(i["training_record_no"] for i in items)

        # 등록순도 created_at 이 같으면 id 내림차순으로 갈라진다
        by_id_desc = sorted(records, key=lambda r: r.id, reverse=True)
        assert seen == [r.training_record_no for r in by_id_desc]
