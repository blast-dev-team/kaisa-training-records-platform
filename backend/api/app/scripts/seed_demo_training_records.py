"""데모 교육이력 시드 — staging(DEV) DB 전용. prod 에는 실행하지 않는다.

- 데모 교육생 1명(trainees, 유저 미연결) + 교육이력 20건(is_demo=True)
- 모든 로그인 회원이 /api/me/training-records 로 이 20건을 본다
- 교육기관·교육과정 마스터(training_institutions·training_courses)를 find-or-create 하고
  이력의 institution_id·course_id 를 연결한다 — 기존 is_demo 이력도 소급 연결
- 멱등: is_demo 건이 이미 있으면 건너뛴다 (교육생은 training_record_no 로 판별)

실행:
    # 로컬
    uv run python -m app.scripts.seed_demo_training_records
    # staging EC2 (SSM 접속 후)
    docker compose exec api python -m app.scripts.seed_demo_training_records
"""

import asyncio
import logging
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select

from app.core.database import async_session
from app.core.kst import now_kst
from app.domain.institution.model import TrainingCourse, TrainingInstitution
from app.domain.trainee.model import MembershipGrade, Trainee
from app.domain.training_record.model import TrainingRecord

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 데모 교육생 — 소속 회원 없음. is_demo 이력의 소속 요건(NOT NULL) 충족용
DEMO_TRAINEE_NO = "DEMO-0000"
DEMO_RECORD_COUNT = 20

# (교육명, 기관, 시작일, 종료일, 이수시간) — FE 목업 표본(Figma 25:2466~) 확장
COURSES: list[tuple[str, str, str, str, int]] = [
    ("비파괴검사 계속교육 (정기)", "협회 본부", "2026-05-14", "2026-05-14", 8),
    ("감리원 법정 계속교육 2차", "부산지회", "2025-11-02", "2025-11-03", 16),
    ("안전관리 실무 심화과정", "협회 본부", "2024-07-19", "2024-07-19", 4),
    ("건설기술 계속교육 (온라인)", "협회 본부", "2026-03-05", "2026-03-05", 4),
    ("공사비 산정 실무 교육", "서울지회", "2026-01-22", "2026-01-22", 8),
    ("설비공사 감리 실무협의", "서울지회", "2025-08-21", "2025-08-21", 8),
    ("토목 안전관리 세미나", "대구지회", "2025-04-10", "2025-04-10", 4),
    ("환경 영향 평가 교육", "인천지회", "2025-06-18", "2025-06-18", 8),
    ("전기설비 감리 교육", "인천지회", "2025-05-27", "2025-05-27", 8),
    ("소방설비 계속교육", "협회 본부", "2025-09-04", "2025-09-04", 4),
    ("공사감독 실무 과정", "협회 본부", "2024-03-15", "2024-03-16", 16),
    ("품질관리 계속교육", "광주지회", "2024-10-30", "2024-10-30", 8),
    ("감리 기초 직무교육", "대전지회", "2021-03-08", "2021-03-08", 8),
    ("건축감리 기초교육", "협회 본부", "2020-09-12", "2020-09-13", 16),
    ("공정관리 실무교육", "춘천지회", "2019-06-20", "2019-06-20", 8),
    ("용접 검사 실무 교육", "울산지회", "2026-02-10", "2026-02-11", 16),
    ("지반조사 및 안전진단 교육", "대구지회", "2025-12-08", "2025-12-09", 16),
    ("철근콘크리트 검사 실무", "부산지회", "2025-10-14", "2025-10-14", 8),
    ("건설 안전관리자 보수교육", "협회 본부", "2026-04-02", "2026-04-02", 4),
    ("비파괴검사 기술 세미나", "광주지회", "2025-07-09", "2025-07-09", 8),
]


def _demo_record_no(index: int) -> str:
    return f"DEMO-TR-{index:04d}"


async def _find_or_create_institutions(
    db, names: list[str]
) -> dict[str, TrainingInstitution]:
    """기관명 → 마스터 find-or-create. 어드민이 만든 동명 기관은 재사용한다."""
    found = {
        inst.name: inst
        for inst in (
            await db.execute(
                select(TrainingInstitution).where(TrainingInstitution.name.in_(names))
            )
        ).scalars()
    }
    institutions: dict[str, TrainingInstitution] = {}
    for name in names:
        institution = found.get(name)
        if institution is None:
            institution = TrainingInstitution(name=name)
            db.add(institution)
            await db.flush()
            logger.info("교육기관 마스터 생성: %s", name)
        institutions[name] = institution
    return institutions


async def _find_or_create_courses(
    db, specs: list[tuple[str, TrainingInstitution, Decimal]]
) -> dict[tuple[str, str], TrainingCourse]:
    """(교육명, 기관) → 과정 마스터 find-or-create. 시간은 과정 마스터 기준값."""
    names = [name for name, _, _ in specs]
    found = {
        (course.name, str(course.institution_id)): course
        for course in (
            await db.execute(
                select(TrainingCourse).where(TrainingCourse.name.in_(names))
            )
        ).scalars()
    }
    courses: dict[tuple[str, str], TrainingCourse] = {}
    for name, institution, hours in specs:
        key = (name, str(institution.id))
        course = found.get(key)
        if course is None:
            course = TrainingCourse(
                institution_id=institution.id,
                name=name,
                total_hours=hours,
            )
            db.add(course)
            await db.flush()
            logger.info("교육과정 마스터 생성: %s (%s)", name, institution.name)
        courses[key] = course
    return courses


async def seed_demo_training_records() -> None:
    async with async_session() as db:
        trainee = (
            await db.execute(
                select(Trainee).where(Trainee.trainee_no == DEMO_TRAINEE_NO)
            )
        ).scalar_one_or_none()
        if trainee is None:
            trainee = Trainee(
                name="데모 교육생",
                trainee_no=DEMO_TRAINEE_NO,
                review_status="approved",
            )
            db.add(trainee)
            await db.flush()
            logger.info("데모 교육생 생성: %s", trainee.id)

        # 교육기관·과정 마스터 — 이력보다 먼저 확보해 FK 로 연결한다
        institution_names = list(dict.fromkeys(row[1] for row in COURSES))
        institutions = await _find_or_create_institutions(db, institution_names)
        course_specs = [
            (course, institutions[institution], Decimal(hours))
            for course, institution, _, _, hours in COURSES
        ]
        courses = await _find_or_create_courses(db, course_specs)

        existing = (
            await db.execute(
                select(func.count()).select_from(TrainingRecord).where(
                    TrainingRecord.is_demo.is_(True)
                )
            )
        ).scalar_one()
        if existing >= DEMO_RECORD_COUNT:
            logger.info("데모 이력 %s건 이미 존재 — 건너뜀", existing)
        else:
            # 학번 재시드 대비 — 기존 데모 이력의 번호를 유지하고 부족분만 채운다
            existing_nos = set(
                (
                    await db.execute(
                        select(TrainingRecord.training_record_no).where(
                            TrainingRecord.is_demo.is_(True)
                        )
                    )
                ).scalars(),
            )
            created = 0
            for index, (course, institution_name, start, end, hours) in enumerate(
                COURSES[:DEMO_RECORD_COUNT], start=1
            ):
                record_no = _demo_record_no(index)
                if record_no in existing_nos:
                    continue
                institution = institutions[institution_name]
                db.add(
                    TrainingRecord(
                        training_record_no=record_no,
                        trainee_id=trainee.id,
                        course_id=courses[(course, str(institution.id))].id,
                        institution_id=institution.id,
                        course_name=course,
                        institution_name=institution_name,
                        total_hours=Decimal(hours),
                        completed_hours=Decimal(hours),
                        started_at=date.fromisoformat(start),
                        ended_at=date.fromisoformat(end),
                        source="internal",
                        completion_status="completed",
                        is_demo=True,
                        memo="staging 데모 데이터",
                    )
                )
                created += 1
            logger.info("데모 교육이력 %s건 생성 완료", created)

        # 표기 항목 백필 — 서식번호·문서번호·감리원 등급·감리원증 발급번호 (NULL 데모 건만, 멱등)
        # DEMO-TR-0001 꼬리 번호로 결정론 생성 — 재실행해도 같은 값 유지
        filled = 0
        unmarked = (
            await db.execute(
                select(TrainingRecord).where(
                    TrainingRecord.is_demo.is_(True),
                    TrainingRecord.form_no.is_(None),
                )
            )
        ).scalars()
        for record in unmarked:
            index = int(record.training_record_no.rsplit("-", 1)[-1])
            year = record.started_at.year if record.started_at else now_kst().year
            record.form_no = f"제{index}호"
            record.doc_no = f"대축-{year}-{index:04d}"
            record.supervisor_grade = "정감리원" if index % 2 else "부감리원"
            record.supervisor_cert_no = f"감리-{year}-{index:04d}"
            filled += 1
        if filled:
            logger.info("표기 항목 백필 %s건 (서식·문서번호·감리원 등급·감리원증 발급번호)", filled)

        # 데모 기본 단가 보장 — 가격 미설정 등급만 3,000원으로 채운다 (가격은 등급 소속)
        ensured = 0
        grades = (await db.execute(select(MembershipGrade))).scalars().all()
        for grade in grades:
            if grade.price_krw == 0:
                grade.price_krw = 3000
                ensured += 1
        if ensured:
            logger.info("데모 기본 단가 %s건 설정", ensured)

        # 소급 연결 — course_id·institution_id 비어 있는 기존 데모 이력을 마스터에 묶는다
        linked = 0
        records = (
            await db.execute(
                select(TrainingRecord).where(
                    TrainingRecord.is_demo.is_(True),
                    TrainingRecord.course_id.is_(None),
                )
            )
        ).scalars()
        for record in records:
            institution = institutions.get(record.institution_name)
            if institution is None:
                continue
            course = courses.get((record.course_name, str(institution.id)))
            if course is None:
                continue
            record.institution_id = institution.id
            record.course_id = course.id
            linked += 1
        if linked:
            logger.info("기존 데모 이력 %s건 마스터 연결 완료", linked)

        await db.commit()


if __name__ == "__main__":
    asyncio.run(seed_demo_training_records())
