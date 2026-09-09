"""로컬 개발용 시드 — `make seed` 로 실행. 멱등: 이미 있으면 건너뛴다.

- 회원등급 3종 (정회원/준회원/비회원)
- 마스터 관리자 (ADMIN_EMAIL / ADMIN_PASSWORD)
- 교육생 3명: CI 보유 이관분 2명(users 선생성·연결) + CI 없는 이관분 1명(수동 매칭 대상)
"""

import asyncio
import logging

from sqlalchemy import select

from app.core.config import settings
from app.core.crypto import encrypt_field, sha256_hex
from app.core.database import async_session
from app.core.security import hash_password
from app.domain.auth.model import AdminUser
from app.domain.trainee.model import MembershipGrade, Trainee
from app.domain.user.model import User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

GRADES = [
    ("regular", "정회원", 1),
    ("associate", "준회원", 2),
    ("nonmember", "비회원", 3),
]


async def seed() -> None:
    async with async_session() as db:
        # 1. 회원등급
        grade_by_code: dict[str, MembershipGrade] = {}
        for code, name, sort_order in GRADES:
            grade = (
                await db.execute(
                    select(MembershipGrade).where(MembershipGrade.code == code)
                )
            ).scalar_one_or_none()
            if not grade:
                grade = MembershipGrade(code=code, name=name, sort_order=sort_order)
                db.add(grade)
                logger.info("등급 생성: %s(%s)", name, code)
            grade_by_code[code] = grade
        await db.flush()

        # 2. 마스터 관리자
        if not settings.ADMIN_PASSWORD:
            raise ValueError("ADMIN_PASSWORD 가 비어 있습니다. .env 에 설정하세요.")
        admin = (
            await db.execute(
                select(AdminUser).where(AdminUser.email == settings.ADMIN_EMAIL)
            )
        ).scalar_one_or_none()
        if not admin:
            admin = AdminUser(
                email=settings.ADMIN_EMAIL,
                password_hash=hash_password(settings.ADMIN_PASSWORD),
                name="마스터 관리자",
                role="super",
            )
            db.add(admin)
            logger.info("관리자 생성: %s", settings.ADMIN_EMAIL)

        # 3. 교육생 — CI 보유 이관분은 users 행을 미리 생성해 연결
        ci_trainees = [
            ("TR-2024-0001", "김정회", "regular", "01011112222", "seed-ci-kim"),
            ("TR-2024-0002", "박준회", "associate", "01033334444", "seed-ci-park"),
        ]
        for trainee_no, name, grade_code, phone, ci_raw in ci_trainees:
            ci_hash = sha256_hex(ci_raw)
            user = (
                await db.execute(select(User).where(User.ci_hash == ci_hash))
            ).scalar_one_or_none()
            if not user:
                user = User(ci_hash=ci_hash, name=name)
                db.add(user)
                await db.flush()
                logger.info("이관 user 생성: %s (ci=%s...)", name, ci_hash[:8])
            trainee = (
                await db.execute(
                    select(Trainee).where(Trainee.trainee_no == trainee_no)
                )
            ).scalar_one_or_none()
            if not trainee:
                trainee = Trainee(
                    user_id=user.id,
                    trainee_no=trainee_no,
                    name=name,
                    phone_encrypted=encrypt_field(phone),
                    membership_grade_id=grade_by_code[grade_code].id,
                    review_status="approved",
                )
                db.add(trainee)
                logger.info("교육생 생성(CI 보유): %s %s", trainee_no, name)

        # 4. 교육생 — CI 없는 이관분 (관리자 수동 매칭 대상)
        no_ci_trainee = (
            await db.execute(
                select(Trainee).where(Trainee.trainee_no == "TR-2023-0009")
            )
        ).scalar_one_or_none()
        if not no_ci_trainee:
            db.add(
                Trainee(
                    trainee_no="TR-2023-0009",
                    name="이미판",
                    phone_encrypted=encrypt_field("01055556666"),
                    membership_grade_id=grade_by_code["nonmember"].id,
                    review_status="unverified",
                    memo="CI 없는 이관분 — 로그인 시 관리자 수동 매칭 대상",
                )
            )
            logger.info("교육생 생성(CI 없음): TR-2023-0009 이미판")

        await db.commit()
        logger.info("시드 완료")


if __name__ == "__main__":
    asyncio.run(seed())
