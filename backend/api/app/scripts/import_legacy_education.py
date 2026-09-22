"""구 감리협회 시스템 엑셀 이관 — 감리원·과목·일정·수강신청 4탭. 멱등.

대상: '20260903★ 계속교육과목등록.xlsx' 형식 (EDC dump)

    감리원추가        → trainees          (trainee_no = EDU-{NO}, 이름+생일 find)
    계속교육과목      → training_institutions + training_courses (course_code = EDC-{sn})
    계속교육과목상세   → course_sessions   (schedule_no = EDC_SCHDL_SN)
    수강신청          → training_records  (record_no = LEG-EDC-{SCHDL_SN}-{감리원키})
    외부교육수강기록   → external 과정 + training_records (record_no = LEG-EXT-{행번호})

조인 전략(검증 완료):
    수강신청.SCHDL_SN → course_sessions.schedule_no (1순위)
    미싱 16종은 회차명+과목명으로 course 역조회 fallback (2순위)
    SCHDL_SN 단독 중복 5종(125행)은 회차명+과목명이 같은 과정으로 수렴 — 첫 일정 연결

실행:
    uv run python -m app.scripts.import_legacy_education \
        "/Users/choegilang/Downloads/20260903★ 계속교육과목등록 (1).xlsx"
"""

import asyncio
import logging
import sys
from datetime import date
from decimal import Decimal

import openpyxl
from sqlalchemy import select

from app.core.database import async_session
from app.domain.institution.model import (
    CourseSession,
    SessionName,
    TrainingCourse,
    TrainingInstitution,
)
from app.domain.trainee.model import Trainee
from app.domain.training_record.model import TrainingRecord

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

# 교육구분 코드 → 과정 category
EDC_SE_CATEGORY = {1: "온라인", 2: "집체"}


def _parse_date(value) -> date | None:
    """엑셀 날짜 'YYYY.MM.DD' 문자열 → date. 결측/이상치는 None."""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        y, m, d = str(value).strip().split(".")
        return date(int(y), int(m), int(d))
    except (ValueError, AttributeError):
        return None


def _clean(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _norm(text: str) -> str:
    """이름 비교용 — 공백 제거 소문자."""
    return text.replace(" ", "").lower()


def _parse_hours(value) -> Decimal:
    """시간 컬럼 → Decimal. '#N/A' 등 이상치는 0."""
    if value is None:
        return Decimal(0)
    try:
        return Decimal(str(value).strip())
    except ArithmeticError:
        return Decimal(0)


def _course_name(session_name: str | None, subject_name: str) -> str:
    """과정명 규칙 — 회차명이 과목명을 이미 담고 있으면(외부기관 과정) 회차명만."""
    if session_name and _norm(subject_name) in _norm(session_name):
        return session_name
    return f"{session_name} {subject_name}" if session_name else subject_name


async def import_legacy_education(xlsx_path: str) -> None:
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)

    async with async_session() as db:
        # ── 1. 감리원추가 → trainees ─────────────────────────────────────
        supervisors: dict[int, Trainee] = {}  # legacy NO → trainee
        existing_trainees = {
            t.trainee_no: t
            for t in (await db.execute(select(Trainee))).scalars()
            if t.trainee_no
        }
        # (이름, 생일) → 교육생 — 재실행 시에도 같은 사람이 새로 생성되지 않도록
        # DB 의 이관분 전체로 인덱스를 만든다 (NO 가 여러 개인 인물 병합)
        by_identity: dict[tuple[str, str], Trainee] = {}
        for t in existing_trainees.values():
            if t.trainee_no and (t.trainee_no.startswith("EDU-") or t.trainee_no.startswith("LEG-")) and t.birth_date:
                by_identity.setdefault((t.name, str(t.birth_date)), t)
        created = 0
        filled_cert = filled_grade = 0
        for row in wb["감리원추가"].iter_rows(min_row=2, values_only=True):
            no = row[2]
            name = _clean(row[3])
            if not isinstance(no, int) or not name:
                continue  # 정크 행
            birth = _parse_date(row[6])
            cert_no = _clean(row[4])
            supervisor_grade = _clean(row[5])  # 감리원 등급 (감리원/수석감리원)
            trainee_no = f"EDU-{no}"
            found = existing_trainees.get(trainee_no)
            if found is None:
                ident = (name, str(birth))
                found = by_identity.get(ident)
                if found is None:
                    found = Trainee(
                        trainee_no=trainee_no,
                        name=name,
                        cert_no=cert_no,
                        supervisor_grade=supervisor_grade,
                        birth_date=birth,
                        review_status="approved",
                    )
                    db.add(found)
                    created += 1
                    by_identity[ident] = found
                    existing_trainees[trainee_no] = found
            # 백필 — 기존 이관분도 증번호·감리원등급을 채운다
            if cert_no and not found.cert_no:
                found.cert_no = cert_no
                filled_cert += 1
            if supervisor_grade and not found.supervisor_grade:
                found.supervisor_grade = supervisor_grade
                filled_grade += 1
            supervisors[no] = found
        await db.flush()
        logger.info(
            "[감리원] %s행 → 교육생 신규 %s (증번호 백필 %s · 등급 배정 %s)",
            len(supervisors), created, filled_cert, filled_grade,
        )
        # 감리원등급·증번호 — 이력 생성 시 스냅샷으로 주입
        supervisor_meta: dict[int, tuple[str | None, str | None]] = {}
        for row in wb["감리원추가"].iter_rows(min_row=2, values_only=True):
            no = row[2]
            if isinstance(no, int):
                supervisor_meta[no] = (_clean(row[4]), _clean(row[5]))  # 증번호, 등급명

        # ── 2. 계속교육과목 → institutions + courses ────────────────────
        existing_courses = {
            c.course_code: c
            for c in (await db.execute(select(TrainingCourse))).scalars()
            if c.course_code
        }
        existing_institutions = {
            i.name: i
            for i in (
                await db.execute(select(TrainingInstitution))
            ).scalars()
        }
        courses: dict[int, TrainingCourse] = {}  # legacy edc_sn → course
        session_names_by_name: dict[str, SessionName] = {
            n.name: n
            for n in (await db.execute(select(SessionName))).scalars()
        }
        created_session_name = 0
        created_inst = created_course = 0
        skipped_subject = 0
        for row in wb["계속교육과목"].iter_rows(min_row=2, values_only=True):
            sn = row[2]
            institution_name = _clean(row[3])
            session_name_str = _clean(row[4])
            subject_name = _clean(row[5])
            if not isinstance(sn, int) or not subject_name or not institution_name:
                skipped_subject += 1  # 과목명/기관 결측 — 회차 플레이스홀더·정크
                continue
            course_code = f"EDC-{sn}"
            # 회차명 마스터 find-or-create
            session_name = None
            if session_name_str:
                session_name = session_names_by_name.get(session_name_str)
                if session_name is None:
                    session_name = SessionName(name=session_name_str)
                    db.add(session_name)
                    await db.flush()
                    session_names_by_name[session_name_str] = session_name
                    created_session_name += 1
            course = existing_courses.get(course_code)
            if course is not None:
                # 백필 — 기존 이관 과정에 회차명 연결
                if session_name and not course.session_name_id:
                    course.session_name_id = session_name.id
                courses[sn] = course
                continue
            institution = existing_institutions.get(institution_name)
            if institution is None:
                institution = TrainingInstitution(name=institution_name)
                db.add(institution)
                await db.flush()  # course FK 에 id 필요
                existing_institutions[institution_name] = institution
                created_inst += 1
            name = _course_name(session_name_str, subject_name)
            course = TrainingCourse(
                course_code=course_code,
                institution_id=institution.id,
                session_name_id=session_name.id if session_name else None,
                name=name,
                category=EDC_SE_CATEGORY.get(row[7]),
            )
            db.add(course)
            existing_courses[course_code] = course
            created_course += 1
            courses[sn] = course
        await db.flush()
        logger.info(
            "[과목] 신규 기관 %s · 신규 과정 %s · 회차명 마스터 %s (제외 %s)",
            created_inst, created_course, created_session_name, skipped_subject,
        )

        # ── 3. 계속교육과목상세 → course_sessions ────────────────────────
        existing_sessions = {
            (s.course_id, s.schedule_no): s
            for s in (await db.execute(select(CourseSession))).scalars()
            if s.schedule_no is not None
        }
        created_session = 0
        skipped_session = 0
        for row in wb["계속교육과목상세"].iter_rows(min_row=2, values_only=True):
            edc_sn, schedule_no = row[0], row[2]
            if not isinstance(edc_sn, int) or not isinstance(schedule_no, int):
                skipped_session += 1
                continue
            course = courses.get(edc_sn)
            if course is None:
                skipped_session += 1  # orphan edc_sn (0, 735, 736 …)
                continue
            hours = _parse_hours(row[13])
            key = (course.id, schedule_no)
            if key not in existing_sessions:
                session = CourseSession(
                    course_id=course.id,
                    schedule_no=schedule_no,
                    started_at=_parse_date(row[8]),
                    ended_at=_parse_date(row[9]),
                    total_hours=_parse_hours(row[12]) or hours,
                    recognized_hours=hours,
                )
                db.add(session)
                existing_sessions[key] = session
                created_session += 1
        await db.flush()
        logger.info("[일정] 신규 %s (제외 %s)", created_session, skipped_session)

        # 과정 총시간 백필 — 대표 일정(첫)의 인정시간. 0인 신규 과정만
        for course in courses.values():
            if course.total_hours == 0:
                for (course_id, _), s in existing_sessions.items():
                    if course_id == course.id and s.recognized_hours:
                        course.total_hours = s.recognized_hours
                        break

        # ── 4. 수강신청 → training_records ───────────────────────────────
        session_by_no: dict[int, CourseSession] = {}
        for s in existing_sessions.values():
            session_by_no.setdefault(s.schedule_no, s)  # 중복 no — 첫 값
        course_by_name: dict[tuple[str, str], TrainingCourse] = {}
        for c in existing_courses.values():
            course_by_name.setdefault(c.name, c)

        existing_record_nos: set[str] = set(
            (
                await db.execute(
                    select(TrainingRecord.training_record_no).where(
                        TrainingRecord.training_record_no.like("LEG-EDC-%")
                    )
                )
            ).scalars()
        )
        created_record = skipped_enroll = fallback = no_session = 0
        for row in wb["수강신청"].iter_rows(min_row=2, values_only=True):
            schedule_no, partc_no = row[1], row[2]
            if schedule_no == "#N/A" or partc_no == "#N/A":
                skipped_enroll += 1
                continue
            trainee = supervisors.get(partc_no) if isinstance(partc_no, int) else None
            if trainee is None:
                skipped_enroll += 1  # 감리원 미스 3종 (#N/A, 0, None)
                continue
            record_no = f"LEG-EDC-{schedule_no}-{partc_no}"
            if record_no in existing_record_nos:
                continue  # 이미 이관됨 — (일정, 감리원) 중복 등록도 여기서 흡수
            session = None
            if isinstance(schedule_no, int):
                session = session_by_no.get(schedule_no)
            course = session.course if session else None
            if session is None:
                # fallback — 회차명+과목명으로 course 역조회
                session_name, subject_name = _clean(row[5]), _clean(row[6])
                course = (
                    course_by_name.get(_course_name(session_name, subject_name))
                    if session_name and subject_name
                    else None
                )
                if course is None:
                    skipped_enroll += 1
                    continue
                fallback += 1
                for (course_id, _), s in existing_sessions.items():
                    if course_id == course.id:
                        session = s  # 다중 일정이면 첫 개설분
                        break
            hours = _parse_hours(row[4])
            cert_no, grade = supervisor_meta.get(partc_no, (None, None))
            existing_record_nos.add(record_no)
            created_record += 1
            db.add(
                TrainingRecord(
                    training_record_no=record_no,
                    trainee_id=trainee.id,
                    course_id=course.id if course else None,
                    session_id=session.id if session else None,
                    institution_id=course.institution_id if course else None,
                    course_name=course.name if course else "",
                    institution_name=(
                        course.institution.name if course else ""
                    ),
                    supervisor_grade=grade,
                    supervisor_cert_no=cert_no,
                    total_hours=hours,
                    completed_hours=hours,
                    started_at=session.started_at if session else None,
                    ended_at=session.ended_at if session else None,
                    source="legacy_import",
                    completion_status="completed",
                )
            )
            if session is None:
                no_session += 1
            if created_record % 1000 == 0:
                await db.flush()
                logger.info("  … %s건", created_record)
        await db.flush()
        logger.info(
            "[수강신청] 이력 신규 %s (fallback 조인 %s · 일정없음 %s · 제외 %s)",
            created_record, fallback, no_session, skipped_enroll,
        )

        # ── 5. 외부교육수강기록 → external 과정 + 이력 ────────────────────
        # 감리원이 개인적으로 수료한 외부 교육. 일정(course_sessions)은 만들지
        # 않고 이력에 기간을 직접 기록한다 — 개설 회차 관리 대상이 아니기 때문.
        # 교육생 매칭은 감리원증번호(cert_no) 유일 일치로만 한다 — 생일은 원본 전체 결측.
        trainees_by_cert: dict[str, list[Trainee]] = {}
        for t in (await db.execute(select(Trainee))).scalars():
            if t.deleted_at is None and t.cert_no:
                trainees_by_cert.setdefault(t.cert_no.strip(), []).append(t)

        ext_institutions: dict[str, TrainingInstitution] = {}
        ext_courses: dict[tuple[str, str], TrainingCourse] = {}  # (기관, 과목명)
        ext_record_nos: set[str] = set(
            (
                await db.execute(
                    select(TrainingRecord.training_record_no).where(
                        TrainingRecord.training_record_no.like("LEG-EXT-%")
                    )
                )
            ).scalars()
        )

        created_ext_course = created_ext_record = 0
        skipped_ext = 0
        for rowno, row in enumerate(
            wb["외부교육수강기록"].iter_rows(min_row=2, values_only=True),
            start=1,
        ):
            institution_name = _clean(row[0])
            subject_name = _clean(row[1])
            if not institution_name or not subject_name:
                continue  # 빈 행
            record_no = f"LEG-EXT-{rowno}"
            if record_no in ext_record_nos:
                continue  # 이미 이관됨

            # 교육생 — 감리원증번호 유일 일치
            cert_no = _clean(row[6])
            matched = trainees_by_cert.get(cert_no or "", [])
            if len(matched) != 1:
                skipped_ext += 1  # 증번호 결측·중복 → 수동 정리 대상
                continue
            trainee = matched[0]

            # 기관·과정 find-or-create (과정은 외부 플래그)
            institution = ext_institutions.get(institution_name) or (
                existing_institutions.get(institution_name)
            )
            if institution is None:
                institution = TrainingInstitution(name=institution_name)
                db.add(institution)
                await db.flush()
                existing_institutions[institution_name] = institution
            ext_institutions[institution_name] = institution

            course_key = (institution_name, subject_name)
            course = ext_courses.get(course_key)
            if course is None:
                course = (
                    await db.execute(
                        select(TrainingCourse).where(
                            TrainingCourse.institution_id == institution.id,
                            TrainingCourse.name == subject_name,
                            TrainingCourse.is_external.is_(True),
                        )
                    )
                ).scalar_one_or_none()
            if course is None:
                course = TrainingCourse(
                    institution_id=institution.id,
                    name=subject_name,
                    is_external=True,
                )
                db.add(course)
                await db.flush()
                created_ext_course += 1
            ext_courses[course_key] = course

            hours = _parse_hours(row[5]) or _parse_hours(row[4])
            existing_record_nos.add(record_no)
            ext_record_nos.add(record_no)
            created_ext_record += 1
            db.add(
                TrainingRecord(
                    training_record_no=record_no,
                    trainee_id=trainee.id,
                    course_id=course.id,
                    institution_id=institution.id,
                    course_name=course.name,
                    institution_name=institution.name,
                    total_hours=hours,
                    completed_hours=hours,
                    started_at=_parse_date(row[2]),
                    ended_at=_parse_date(row[3]),
                    source="external",
                    completion_status="completed",
                )
            )
            if created_ext_record % 500 == 0:
                await db.flush()
                logger.info("  … 외부 %s건", created_ext_record)
        await db.flush()
        logger.info(
            "[외부교육] 이력 신규 %s · 신규 과정 %s (증번호 미스·중복 제외 %s)",
            created_ext_record, created_ext_course, skipped_ext,
        )

        await db.commit()
        logger.info("완료 — 커밋됨")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    asyncio.run(import_legacy_education(sys.argv[1]))
