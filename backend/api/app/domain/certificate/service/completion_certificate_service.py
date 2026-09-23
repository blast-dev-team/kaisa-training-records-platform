"""수료증 발급 — 내부 기관 수료내역 전용. 번호 채번 + 스냅샷.

번호는 `YYYY-MM-NNN호` — 월별 리셋 연번(2026-09-001호, 002호, …).
표시 형식 그대로 저장해 진위확인 입력값과 비교가 단순해진다.
"""

import uuid

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.crypto import decrypt_field
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.auth.model import AdminUser
from app.domain.certificate.model import CompletionCertificate
from app.domain.certificate.repository import (
    completion_certificate_repository as repo,
)
from app.domain.institution.model.course_session import CourseSession
from app.domain.training_record.model import TrainingRecord


async def _next_completion_cert_no(db: AsyncSession) -> str:
    """`{연}-{월}-{연번 3자리}호` — 이번 달 발급분 최대 연번 + 1.

    연번은 '001호' 처럼 '호' 가 붙어 저장되므로 숫자만 남긴 뒤 비교한다 —
    VARCHAR max 는 사전순이라 숫자 경계(9→10)에서 겹친다. unique 제약이 최후 방어.
    """
    prefix = now_kst().strftime("%Y-%m-")
    seq_part = cast(
        func.regexp_replace(
            func.split_part(CompletionCertificate.certificate_no, "-", 3),
            "[^0-9]",
            "",
            "g",
        ),
        Integer,
    )
    result = await db.execute(
        select(func.max(seq_part)).where(
            CompletionCertificate.certificate_no.like(f"{prefix}%")
        )
    )
    last = result.scalar_one_or_none()
    return f"{prefix}{(last or 0) + 1:03d}호"


async def _session_name(db: AsyncSession, record: TrainingRecord) -> str | None:
    """교육과정(회차명) — 연결된 일정의 과정이 가진 회차명. 미연결이면 None."""
    if record.session_id is None:
        return None
    session = await db.get(CourseSession, record.session_id)
    course = session.course if session else None
    if course is None:
        return None
    return course.session_name.name if course.session_name else None


def _ensure_issuable(
    by_id: dict[uuid.UUID, TrainingRecord], record_ids: list[uuid.UUID]
) -> None:
    """게이트 — 내부 기관 + 수료 완료. 하나라도 통과 못 하면 전체를 거절한다.

    일부만 발급되면 어떤 건이 빠졌는지 사용자가 다시 헤아려야 한다.
    """
    for rid in record_ids:
        record = by_id[rid]
        institution = record.institution
        if (
            institution is None
            or institution.institution_type != "internal"
            or record.completion_status != "completed"
        ):
            raise api_error("COMPLETION_CERTIFICATE_NOT_ALLOWED")


async def _issue_certificates(
    db: AsyncSession,
    by_id: dict[uuid.UUID, TrainingRecord],
    record_ids: list[uuid.UUID],
    actor_admin_id: uuid.UUID | None,
    audit_after_extra: dict,
) -> list[CompletionCertificate]:
    """발급 공통 — 1 이력 = 1 수료증. 이미 발급된 건은 기존 수료증을 그대로 돌려준다.

    감사로그 actor 는 어드민 경로면 admin id, 웹 회원 경로면 None 이고
    발급 주체 정보는 audit_after_extra 로 남긴다 (audit 테이블에 trainee 컬럼 없음).
    """
    issued_at = now_kst()
    existing = await repo.find_by_record_ids(db, record_ids)

    certificates: list[CompletionCertificate] = []
    for rid in record_ids:
        if rid in existing:
            certificates.append(existing[rid])
            continue
        record = by_id[rid]
        trainee = record.trainee
        # 채번 경합 방어 — 동시 발급이 같은 연번을 쓰면 unique 위반이라
        # 세이브포인트로 이번 삽입만 롤백하고 번호를 다시 따낸다
        for _ in range(5):
            try:
                async with db.begin_nested():
                    cert = CompletionCertificate(
                        certificate_no=await _next_completion_cert_no(db),
                        training_record_id=record.id,
                        trainee_id=record.trainee_id,
                        issued_name_encrypted=trainee.name_encrypted,
                        issued_name_hash=trainee.name_hash,
                        trainee_birth_date=trainee.birth_date,
                        course_name=record.course_name,
                        session_name=await _session_name(db, record),
                        institution_name=record.institution_name,
                        completed_hours=record.completed_hours,
                        started_at=record.started_at,
                        ended_at=record.ended_at,
                        issued_at=issued_at,
                        status="issued",
                    )
                    db.add(cert)
                    await db.flush()
            except IntegrityError:
                again = await repo.find_by_record_ids(db, [rid])
                if rid in again:
                    cert = again[rid]  # 남이 먼저 발급함 — 멱등 채택
                    break
                continue  # 번호 충돌 — 재채번 후 재시도
            record_audit(
                db,
                actor_admin_id=actor_admin_id,
                action="completion_certificate.issued",
                entity_type="completion_certificate",
                entity_id=cert.id,
                after={
                    "certificate_no": cert.certificate_no,
                    "training_record_no": record.training_record_no,
                    **audit_after_extra,
                },
            )
            certificates.append(cert)
            break
        else:
            raise api_error(
                "CERT_NO_GENERATION_FAILED",
                message="수료증 번호 발급에 실패했어요. 잠시 후 다시 시도해 주세요",
            )

    await db.commit()
    for cert in certificates:
        await db.refresh(cert)
    return certificates


async def issue_completion_certificates(
    db: AsyncSession,
    record_ids: list[uuid.UUID],
    admin: AdminUser,
) -> list[CompletionCertificate]:
    """발급(어드민) — 내부 기관 수료내역 전용."""
    rows = (
        await db.execute(
            select(TrainingRecord).where(TrainingRecord.id.in_(record_ids))
        )
    ).scalars().all()
    by_id = {record.id: record for record in rows}
    if any(rid not in by_id for rid in record_ids):
        raise api_error("NOT_FOUND", message="교육내역을 찾을 수 없어요")
    _ensure_issuable(by_id, record_ids)
    return await _issue_certificates(db, by_id, record_ids, admin.id, {})


async def issue_completion_certificates_for_trainee(
    db: AsyncSession,
    record_ids: list[uuid.UUID],
    trainee,
) -> list[CompletionCertificate]:
    """발급(웹 회원) — 소유 이력만. 무료·멱등.

    데모 이력은 여러 회원이 공유하므로 소유 검사(trainee_id 일치)에서 자동 제외된다.
    타인 이력 요청은 404 로 응답해 존재 여부를 노출하지 않는다.
    """
    rows = (
        await db.execute(
            select(TrainingRecord).where(TrainingRecord.id.in_(record_ids))
        )
    ).scalars().all()
    by_id = {record.id: record for record in rows}
    if any(
        rid not in by_id or by_id[rid].trainee_id != trainee.id
        for rid in record_ids
    ):
        raise api_error("NOT_FOUND", message="교육내역을 찾을 수 없어요")
    _ensure_issuable(by_id, record_ids)
    return await _issue_certificates(
        db, by_id, record_ids, None, {"actor": "web", "trainee_id": str(trainee.id)}
    )


async def build_preview_completion_certificate(
    db: AsyncSession, record_id: uuid.UUID
) -> dict:
    """수료증 미리보기(슈퍼 계정) — 저장 없이 스냅샷 응답만 조립.

    발급(INSERT·채번)을 하지 않는다 — 번호는 미부여("")로 돌려준다.
    성명·생년월일은 각 이력을 들은 교육생 데이터를 복호화해 쓴다.
    """
    record = await db.get(TrainingRecord, record_id)
    if record is None or record.deleted_at is not None:
        raise api_error("NOT_FOUND", message="교육내역을 찾을 수 없어요")
    trainee = record.trainee
    return {
        "id": record.id,
        "certificate_no": "",
        "training_record_id": record.id,
        "trainee_id": record.trainee_id,
        "trainee_name": (
            decrypt_field(trainee.name_encrypted) if trainee else None
        ),
        "trainee_birth_date": trainee.birth_date if trainee else None,
        "course_name": record.course_name,
        "session_name": await _session_name(db, record),
        "institution_name": record.institution_name,
        "completed_hours": record.completed_hours,
        "started_at": record.started_at,
        "ended_at": record.ended_at,
        "issued_at": now_kst(),
        "status": "preview",
    }
