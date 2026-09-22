"""로컬 개발용 시드 — `make seed` 로 실행. 멱등: 이미 있으면 건너뛴다.

- 회원등급 3종 (일반/평생/연간) + 기본 발급 가격 규칙 (일반 3,000원·평생/연간 1,800원)
- 마스터 관리자 (ADMIN_EMAIL / ADMIN_PASSWORD)
- 교육생 3명: CI 보유 이관분 2명(users 선생성·연결) + CI 없는 이관분 1명(수동 매칭 대상)
"""

import asyncio
import logging

from sqlalchemy import delete, select

from app.core.config import settings
from app.core.crypto import encrypt_field, sha256_hex
from app.core.database import async_session
from app.core.security import hash_password
from app.domain.auth.model import AdminUser
from app.domain.certificate.model import CertificatePricingRule, CertificateRequest
from app.domain.trainee.model import MembershipGrade, Trainee
from app.domain.user.model import User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 회원등급 — 결제(확인서 발급) 단가 체계. 감리원 등급은 trainees.supervisor_grade 로 분리됨
GRADES = [
    ("general", "일반", 1, 3000),
    ("lifetime", "평생", 2, 1800),
    ("annual", "연간", 3, 1800),
]

# 구 등급 — 정회원/준회원/비회원 + 감리원/수석감리원(회원등급에 잘못 두었던 체계)
LEGACY_GRADE_CODES = (
    "regular",
    "associate",
    "nonmember",
    "supervisor",
    "senior_supervisor",
)


async def seed() -> None:
    async with async_session() as db:
        # 1. 회원등급 — 발급 단가를 등급이 직접 가진다 (기존 가격 규칙 체계 폐지)
        grade_by_code: dict[str, MembershipGrade] = {}
        for code, name, sort_order, price_krw in GRADES:
            grade = (
                await db.execute(
                    select(MembershipGrade).where(MembershipGrade.code == code)
                )
            ).scalar_one_or_none()
            if not grade:
                grade = MembershipGrade(
                    code=code,
                    name=name,
                    sort_order=sort_order,
                    price_krw=price_krw,
                )
                db.add(grade)
                logger.info("등급 생성: %s(%s, %s원)", name, code, price_krw)
            grade_by_code[code] = grade
        await db.flush()

        # 1-2. 구 등급 정리 — 가격 규칙은 지우고, 교육생 등 신청 이력이 참조 중이면
        # 남긴다(수동 재배정 후 재실행). certificate_requests FK(RESTRICT)가 막는다.
        legacy_grades = (
            (
                await db.execute(
                    select(MembershipGrade).where(
                        MembershipGrade.code.in_(LEGACY_GRADE_CODES)
                    )
                )
            )
            .scalars()
            .all()
        )
        for grade in legacy_grades:
            await db.execute(
                delete(CertificatePricingRule).where(
                    CertificatePricingRule.membership_grade_id == grade.id
                )
            )
            # 발급 신청 이력(certificate_requests.membership_grade_id, RESTRICT)은
            # 신청 시점 등급 스냅샷이라 지우면 안 된다 — 참조 중이면 등급도 남긴다
            requested = (
                await db.execute(
                    select(CertificateRequest.id)
                    .where(CertificateRequest.membership_grade_id == grade.id)
                    .limit(1)
                )
            ).scalar_one_or_none()
            if requested is not None:
                logger.warning(
                    "구 등급 %s(%s) 로 발급 신청 이력이 있어 남긴다 — 데이터 정리 후 재실행",
                    grade.name,
                    grade.code,
                )
                continue
            remaining = (
                await db.execute(
                    select(Trainee.id).where(Trainee.membership_grade_id == grade.id).limit(1)
                )
            ).scalar_one_or_none()
            if remaining is not None:
                logger.warning(
                    "구 등급 %s(%s) 에 배정된 교육생이 있어 남긴다 — 수동 재배정 필요",
                    grade.name,
                    grade.code,
                )
                continue
            await db.delete(grade)
            logger.info("구 등급 삭제: %s(%s)", grade.name, grade.code)
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
            ("TR-2024-0001", "김정회", "general", "01011112222", "seed-ci-kim"),
            ("TR-2024-0002", "박준회", "lifetime", "01033334444", "seed-ci-park"),
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
                    membership_grade_id=grade_by_code["general"].id,
                    review_status="unverified",
                    memo="CI 없는 이관분 — 로그인 시 관리자 수동 매칭 대상",
                )
            )
            logger.info("교육생 생성(CI 없음): TR-2023-0009 이미판")

        await db.commit()
        logger.info("시드 완료")


if __name__ == "__main__":
    asyncio.run(seed())
