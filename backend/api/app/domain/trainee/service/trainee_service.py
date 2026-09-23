import io
import re
import secrets
import uuid
import zipfile
from datetime import date, datetime

import openpyxl
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.crypto import decrypt_field, encrypt_field, mask_name, name_hash
from app.core.error_codes import api_error
from app.core.kst import now_kst, today_kst
from app.domain.auth.model import AdminUser
from app.domain.certificate.model import CertificateRequest
from app.domain.payment.model import PaymentOrder
from app.domain.trainee.model import MembershipGrade, Trainee, TraineeGradeHistory
from app.domain.trainee.repository import trainee_repository as repo
from app.domain.trainee.schema import (
    MembershipGradeCreate,
    MembershipGradeUpdate,
    TraineeBulkGradeCreate,
    TraineeBulkUpdate,
    TraineeCreate,
    TraineeImportConfirmRequest,
    TraineeImportPreviewResponse,
    TraineeImportRow,
    TraineeUpdate,
)

# 삭제 차단 — 아직 끝나지 않은 신청·결제가 있는 교육생은 지울 수 없다
_BLOCKING_REQUEST_STATUSES = ("pending", "payment_pending", "paid", "issuing")
_BLOCKING_ORDER_STATUSES = ("ready", "pending")

# 회원등급 코드 — seed GRADES 와 일치. 연간만 기간(만료일)이 있고, 만료 시 일반으로 자동 전환
GENERAL_GRADE_CODE = "general"
PERIOD_GRADE_CODE = "annual"
AUTO_DOWNGRADE_REASON = "연간 회원 기간 만료 — 자동 전환"


async def get_trainee(db: AsyncSession, trainee_id: uuid.UUID) -> Trainee:
    trainee = await repo.find_by_id(db, trainee_id)
    if trainee is None:
        raise api_error("NOT_FOUND")
    return trainee


async def list_trainees(
    db: AsyncSession,
    search: str | None = None,
    review_status: str | None = None,
    grade_id: uuid.UUID | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[Trainee], int]:
    return await repo.list_trainees(
        db,
        search=search,
        review_status=review_status,
        grade_id=grade_id,
        page=page,
        limit=limit,
    )


async def list_cert_no_duplicates(db: AsyncSession) -> list[Trainee]:
    """감리원증번호 중복 교육생 — 관리자가 직접 수정·삭제하는 데이터."""
    return await repo.list_cert_no_duplicates(db)


async def create_trainee(
    db: AsyncSession, data: TraineeCreate, actor: AdminUser
) -> Trainee:
    """어드민 수기 등록 — 신원 확인 완료 가정으로 approved. 등급 지정 시 초기 등급으로 배정."""
    grade_expires_at = None
    if data.membership_grade_id is not None:
        grade = await repo.find_grade_by_id(db, data.membership_grade_id)
        if grade is None:
            raise api_error("NOT_FOUND", message="회원등급을 찾을 수 없어요")
        grade_expires_at = _resolve_grade_expiry(grade, data.grade_expires_at)

    trainee = Trainee(
        trainee_no=f"TR-{now_kst().strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}",
        cert_no=data.cert_no,
        supervisor_grade=data.supervisor_grade,
        name_encrypted=encrypt_field(data.name.strip()),
        name_hash=name_hash(data.name),
        birth_date=data.birth_date,
        phone_encrypted=encrypt_field(data.phone) if data.phone else None,
        email=data.email,
        memo=data.memo,
        membership_grade_id=data.membership_grade_id,
        grade_expires_at=grade_expires_at,
        review_status="approved",
        reviewed_at=now_kst(),
    )
    db.add(trainee)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="trainee.created",
        entity_type="trainee",
        entity_id=trainee.id,
        after={
            "trainee_no": trainee.trainee_no,
            # 감사로그 JSONB 에 평문 이름을 남기지 않는다 — 번호로 식별
            "name": mask_name(data.name),
            "grade_id": str(data.membership_grade_id)
            if data.membership_grade_id
            else None,
        },
    )
    await db.commit()
    await db.refresh(trainee)
    return trainee


def _resolve_grade_expiry(
    grade: MembershipGrade, expires_at: date | None
) -> date | None:
    """등급에 맞는 만료일을 정한다 — 연간은 필수, 그 외 등급은 개념이 없어 NULL 강제."""
    if grade.code != PERIOD_GRADE_CODE:
        return None
    if expires_at is None:
        raise api_error(
            "VALIDATION_ERROR", message="연간 회원은 만료일을 지정해야 해요"
        )
    return expires_at


async def _apply_update(
    db: AsyncSession, trainee: Trainee, data: TraineeUpdate, actor: AdminUser
) -> bool:
    """update_trainee 코어 — commit 없이 필드 반영 + 등급이력/감사로그 기록.

    실제로 반영된 것이 있으면 True (등급 동일·변경 필드 없으면 False).
    bulk 에서 commit 을 1회로 묶기 위해 추출했다 — 단건은 update_trainee 가 commit 한다.
    """
    updates = data.model_dump(
        exclude_unset=True, exclude={"phone", "grade_change_reason"}
    )
    # 등급과 만료일은 한 쌍 — 일반 setattr 루프 전에 여기서만 처리한다
    new_grade_id = updates.pop("membership_grade_id", None)
    expires_sent = "grade_expires_at" in updates
    new_expires = updates.pop("grade_expires_at", None)
    # 이름도 한 쌍(가역+blind index) — setattr 루프 전에 여기서만 처리한다
    new_name = updates.pop("name", None)
    name_sent = new_name is not None and str(new_name).strip() != ""
    grade_changed = False

    if new_grade_id and new_grade_id != trainee.membership_grade_id:
        grade = await repo.find_grade_by_id(db, new_grade_id)
        if grade is None:
            raise api_error("NOT_FOUND", message="회원등급을 찾을 수 없어요")
        expires = _resolve_grade_expiry(grade, new_expires)
        db.add(
            TraineeGradeHistory(
                trainee_id=trainee.id,
                previous_grade_id=trainee.membership_grade_id,
                new_grade_id=new_grade_id,
                change_reason=data.grade_change_reason,
                changed_by=actor.id,
            )
        )
        record_audit(
            db,
            actor_admin_id=actor.id,
            action="trainee.grade_changed",
            entity_type="trainee",
            entity_id=trainee.id,
            before={
                "grade_id": str(trainee.membership_grade_id)
                if trainee.membership_grade_id
                else None
            },
            after={
                "grade_id": str(new_grade_id),
                "grade_expires_at": expires.isoformat() if expires else None,
                "reason": data.grade_change_reason,
            },
        )
        trainee.membership_grade_id = new_grade_id
        trainee.grade_expires_at = expires
        grade_changed = True
    elif expires_sent and trainee.membership_grade_id is not None:
        # 등급 유지 — 만료일만 변경(연간 재결제 연장). 연간이 아닌 등급은 개념이 없어 무시
        if trainee.grade is not None and trainee.grade.code == PERIOD_GRADE_CODE:
            trainee.grade_expires_at = _resolve_grade_expiry(
                trainee.grade, new_expires
            )
            grade_changed = True

    if "phone" in data.model_fields_set:
        phone = data.model_dump(exclude_unset=True).get("phone")
        trainee.phone_encrypted = encrypt_field(phone) if phone else None

    if name_sent:
        trainee.name_encrypted = encrypt_field(str(new_name).strip())
        trainee.name_hash = name_hash(str(new_name))

    for field, value in updates.items():
        setattr(trainee, field, value)
    audit_updates = dict(updates)
    if name_sent:
        # 감사로그 JSONB 에 평문 이름을 남기지 않는다
        audit_updates["name"] = mask_name(str(new_name))
    if audit_updates or "phone" in data.model_fields_set:
        record_audit(
            db,
            actor_admin_id=actor.id,
            action="trainee.updated",
            entity_type="trainee",
            entity_id=trainee.id,
            after={k: str(v) for k, v in audit_updates.items()},
        )

    return (
        grade_changed
        or bool(audit_updates)
        or "phone" in data.model_fields_set
    )


async def update_trainee(
    db: AsyncSession, trainee_id: uuid.UUID, data: TraineeUpdate, actor: AdminUser
) -> Trainee:
    """등급 변경 시 trainee_grade_histories insert + audit. 전화는 암호화 저장."""
    trainee = await get_trainee(db, trainee_id)
    await _apply_update(db, trainee, data, actor)
    await db.commit()
    await db.refresh(trainee)
    return trainee


async def update_trainees_grade_bulk(
    db: AsyncSession, data: TraineeBulkGradeCreate, actor: AdminUser
) -> tuple[int, int]:
    """선택 교육생 회원등급 일괄 변경 — 등급이력은 사유 None 으로 건당 기록. commit 1회."""
    grade = await repo.find_grade_by_id(db, data.membership_grade_id)
    if grade is None:
        raise api_error("NOT_FOUND", message="회원등급을 찾을 수 없어요")

    trainees = await repo.find_by_ids(db, data.trainee_ids)
    updated = skipped = 0
    skipped += len(set(data.trainee_ids) - {t.id for t in trainees})  # 없는/삭제된 id
    for trainee in trainees:
        changed = await _apply_update(
            db,
            trainee,
            TraineeUpdate(
                membership_grade_id=data.membership_grade_id,
                grade_expires_at=data.grade_expires_at,
            ),
            actor,
        )
        if changed:
            updated += 1
        else:
            skipped += 1  # 이미 같은 등급
    await db.commit()
    return updated, skipped


async def expire_due_memberships(db: AsyncSession) -> int:
    """기간 지난 연간 회원을 일반으로 자동 전환 — 만료일 당일까지 유효.

    스케줄러가 없어 등급을 읽는 진입부(관리자 목록·발급가·내 정보)에서 호출한다.
    전환 건은 등급 이력(change_reason=AUTO_DOWNGRADE_REASON, changed_by=NULL)으로 남는다.
    """
    annual = await repo.find_grade_by_code(db, PERIOD_GRADE_CODE)
    general = await repo.find_grade_by_code(db, GENERAL_GRADE_CODE)
    if annual is None or general is None:
        return 0
    expired = await repo.find_expired_annual(db, annual.id, today_kst())
    for trainee in expired:
        db.add(
            TraineeGradeHistory(
                trainee_id=trainee.id,
                previous_grade_id=trainee.membership_grade_id,
                new_grade_id=general.id,
                change_reason=AUTO_DOWNGRADE_REASON,
                changed_by=None,  # 시스템 자동 전환
            )
        )
        trainee.membership_grade_id = general.id
        trainee.grade_expires_at = None
    if expired:
        await db.commit()
    return len(expired)


async def update_trainees_bulk(
    db: AsyncSession, data: TraineeBulkUpdate, actor: AdminUser
) -> tuple[int, int]:
    """선택 교육생 기본정보 일괄 수정 — 보낸 필드만 건별 적용. commit 1회."""
    by_id = {
        t.id: t for t in await repo.find_by_ids(db, [item.id for item in data.items])
    }
    updated = skipped = 0
    for item in data.items:
        patch: dict = {}
        if item.name is not None and item.name.strip():
            patch["name"] = item.name.strip()
        if item.birth_date is not None:
            patch["birth_date"] = item.birth_date
        if item.phone:
            patch["phone"] = item.phone  # 빈 문자열 = 기존 유지
        if item.cert_no and item.cert_no.strip():
            patch["cert_no"] = item.cert_no.strip()  # 빈 문자열 = 기존 유지
        trainee = by_id.get(item.id)
        if trainee is None or not patch:
            skipped += 1
            continue
        await _apply_update(db, trainee, TraineeUpdate(**patch), actor)
        updated += 1
    await db.commit()
    return updated, skipped


async def delete_trainee(
    db: AsyncSession, trainee_id: uuid.UUID, actor: AdminUser
) -> None:
    """소프트딜리트 — deleted_at marking. 확인서·결제 이력은 FK 보존을 위해 그대로 둔다.

    진행 중인 발급 신청·미결제 결제가 있으면 409 차단.
    """
    trainee = await get_trainee(db, trainee_id)

    pending_request = (
        await db.execute(
            select(CertificateRequest.id)
            .where(
                CertificateRequest.trainee_id == trainee.id,
                CertificateRequest.status.in_(_BLOCKING_REQUEST_STATUSES),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if pending_request is not None:
        raise api_error(
            "TRAINEE_HAS_PENDING_WORK",
            status_code=409,
            message="진행 중인 발급 신청이 있어요. 처리 완료 후 삭제할 수 있어요",
        )

    unpaid_order = (
        await db.execute(
            select(PaymentOrder.id)
            .where(
                PaymentOrder.trainee_id == trainee.id,
                PaymentOrder.status.in_(_BLOCKING_ORDER_STATUSES),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if unpaid_order is not None:
        raise api_error(
            "TRAINEE_HAS_PENDING_WORK",
            status_code=409,
            message="미결제 주문이 있어요. 처리 완료 후 삭제할 수 있어요",
        )

    trainee.deleted_at = now_kst()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="trainee.deleted",
        entity_type="trainee",
        entity_id=trainee.id,
        before={"deleted_at": None},
        after={"deleted_at": trainee.deleted_at.isoformat()},
    )
    await db.commit()


# ── 엑셀 일괄 등록 ────────────────────────────────────────────────────────────

_IMPORT_HEADERS = {
    "name": "감리원명",
    "phone": "전화번호",
    "birth_date": "생년월일",
    "cert_no": "감리원증번호",
    "supervisor_grade": "감리원등급명",
    "cert_issued_date": "감리원증발급일자",
}
_IMPORT_MAX_ROWS = 500


def _parse_cell_date(value) -> date | None:
    """셀 값 → date. openpyxl date/datetime 은 그대로, 문자열은 구분자 유연하게.

    실패하면 None — 행 검증에서 오류 메시지로 돌아간다 (예외를 raise 하지 않는다).
    """
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    digits = re.sub(r"\D", "", text)
    if re.fullmatch(r"\d{8}", digits):  # YYYYMMDD
        try:
            return date(int(digits[:4]), int(digits[4:6]), int(digits[6:8]))
        except ValueError:
            return None
    m = re.fullmatch(r"(\d{2,4})[.\-/\s](\d{1,2})[.\-/\s](\d{1,2})", text)
    if m:
        year, month, day = (int(g) for g in m.groups())
        if year < 100:  # 두 자리 연도 — 50 미만은 2000년대
            year += 2000 if year < 50 else 1900
        try:
            return date(year, month, day)
        except ValueError:
            return None
    return None


def _normalize_cell_phone(value) -> str | None:
    """셀 값 → 숫자만. 엑셀 수치 셀은 선행 0 이 잘리므로(1012345678) 한국 번호면 0 을 되살린다.

    +82 국제표기는 82 접두를 0 으로 되돌린다(+82 10-... → 010-...).
    """
    if value is None or value == "":
        return None
    if isinstance(value, float) and value.is_integer():
        digits = str(int(value))
    else:
        digits = re.sub(r"\D", "", str(value))
    if not digits:
        return None
    if digits.startswith("8210"):
        digits = "0" + digits[2:]
    elif digits.startswith("10") and len(digits) in (9, 10):
        digits = "0" + digits
    return digits


def parse_import_file(content: bytes) -> list[TraineeImportRow]:
    """엑셀 1행씩 → TraineeImportRow. 헤더명으로 컬럼을 찾는다(순서 무관).

    완전히 빈 행은 건너뛰고, 감리원명 빠진 행은 errors 를 담아 그대로 돌려준다 —
    프리뷰에서 사용자가 고치거나 제외할 수 있게.
    """
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    except (zipfile.BadZipFile, InvalidFileException):
        raise api_error(
            "VALIDATION_ERROR",
            message="엑셀 파일(.xlsx)을 열 수 없어요. 파일을 확인해 주세요",
        )
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    if not rows:
        raise api_error("VALIDATION_ERROR", message="엑셀에 데이터가 없어요")

    header_map = {
        str(cell).strip(): idx for idx, cell in enumerate(rows[0]) if cell is not None
    }
    missing = [label for label in _IMPORT_HEADERS.values() if label not in header_map]
    if missing:
        raise api_error(
            "VALIDATION_ERROR",
            message=f"엑셀 헤더에 {', '.join(missing)} 이(가) 없어요",
        )

    parsed: list[TraineeImportRow] = []
    for offset, row in enumerate(rows[1:], start=2):
        if offset > _IMPORT_MAX_ROWS:
            raise api_error(
                "VALIDATION_ERROR",
                message=f"한 번에 등록할 수 있는 행은 {_IMPORT_MAX_ROWS}개까지예요",
            )
        cells = {
            field: row[header_map[label]] for field, label in _IMPORT_HEADERS.items()
        }
        if all(v is None or str(v).strip() == "" for v in cells.values()):
            continue  # 완전히 빈 행
        birth = _parse_cell_date(cells["birth_date"])
        issued = _parse_cell_date(cells["cert_issued_date"])
        errors: list[str] = []
        name = str(cells["name"]).strip() if cells["name"] is not None else ""
        if not name:
            errors.append("감리원명이 비어 있어요")
        if (
            cells["birth_date"] is not None
            and str(cells["birth_date"]).strip() != ""
            and birth is None
        ):
            errors.append("생년월일을 읽을 수 없어요 (예: 1985.03.15)")
        if (
            cells["cert_issued_date"] is not None
            and str(cells["cert_issued_date"]).strip() != ""
            and issued is None
        ):
            errors.append("발급일자를 읽을 수 없어요 (예: 2020.05.01)")
        parsed.append(
            TraineeImportRow(
                row_number=offset,
                name=name or None,
                phone=_normalize_cell_phone(cells["phone"]),
                birth_date=birth,
                cert_no=(
                    str(cells["cert_no"]).strip() if cells["cert_no"] is not None else None
                ),
                supervisor_grade=(
                    str(cells["supervisor_grade"]).strip()
                    if cells["supervisor_grade"] is not None
                    else None
                ),
                cert_issued_date=issued,
                errors=errors,
            )
        )
    if not parsed:
        raise api_error("VALIDATION_ERROR", message="엑셀에 등록할 행이 없어요")
    return parsed


async def preview_import(
    db: AsyncSession, content: bytes
) -> TraineeImportPreviewResponse:
    """엑셀 파싱 + 기존 교육생 중복 판별 — 확정 전 프리뷰용."""
    parsed = parse_import_file(content)
    cert_nos = [r.cert_no for r in parsed if r.cert_no]
    pairs = [(r.name, r.birth_date) for r in parsed if r.name and r.birth_date]
    existing = await repo.find_duplicates_for_import(db, cert_nos, pairs)
    by_cert = {t.cert_no: t for t in existing if t.cert_no}
    by_pair = {(t.name_hash, t.birth_date): t for t in existing if t.birth_date}
    for row in parsed:
        hit = by_cert.get(row.cert_no) if row.cert_no else None
        if hit is None and row.name and row.birth_date:
            hit = by_pair.get((name_hash(row.name), row.birth_date))
        if hit is not None:
            row.is_duplicate = True
            row.duplicate_of_name = decrypt_field(hit.name_encrypted)
    return TraineeImportPreviewResponse(rows=parsed, total=len(parsed))


async def confirm_import(
    db: AsyncSession, data: TraineeImportConfirmRequest, actor: AdminUser
) -> tuple[int, int, list[tuple[int, str]]]:
    """프리뷰에서 편집된 행을 일괄 등록 — create_trainee 와 같은 규칙(approved, 암호화).

    중복은 확정 시점에 다시 판별해 skipped 로 돌린다(프리뷰 이후 DB 가 변할 수 있음).
    생성은 flush 1회 + commit 1회.
    """
    cert_nos = [i.cert_no for i in data.items if i.cert_no]
    pairs = [(i.name.strip(), i.birth_date) for i in data.items if i.birth_date]
    existing = await repo.find_duplicates_for_import(db, cert_nos, pairs)
    taken_certs = {t.cert_no for t in existing if t.cert_no}
    taken_pairs = {(t.name_hash, t.birth_date) for t in existing if t.birth_date}

    created: list[Trainee] = []
    skipped = 0
    failed: list[tuple[int, str]] = []
    for item in data.items:
        name = item.name.strip()
        if not name:
            failed.append((item.row_number, "감리원명이 비어 있어요"))
            continue
        if item.cert_no and item.cert_no in taken_certs:
            skipped += 1  # 감리원증번호 중복
            continue
        if item.birth_date and (name_hash(name), item.birth_date) in taken_pairs:
            skipped += 1  # 이름+생년월일 중복
            continue
        trainee = Trainee(
            trainee_no=f"TR-{now_kst().strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}",
            cert_no=item.cert_no,
            supervisor_grade=item.supervisor_grade,
            cert_issued_date=item.cert_issued_date,
            name_encrypted=encrypt_field(name),
            name_hash=name_hash(name),
            birth_date=item.birth_date,
            phone_encrypted=encrypt_field(item.phone) if item.phone else None,
            review_status="approved",
            reviewed_at=now_kst(),
        )
        db.add(trainee)
        created.append(trainee)
    if created:
        await db.flush()  # id 확정 — 감사로그가 entity_id 로 참조
        for trainee in created:
            record_audit(
                db,
                actor_admin_id=actor.id,
                action="trainee.created",
                entity_type="trainee",
                entity_id=trainee.id,
                after={
                    "trainee_no": trainee.trainee_no,
                    # 감사로그 JSONB 에 평문 이름을 남기지 않는다
                    "name": mask_name(name),
                    "source": "excel_import",
                },
            )
    await db.commit()
    return len(created), skipped, failed


# ── 등급 마스터 ────────────────────────────────────────────────────────────────


async def list_grades(
    db: AsyncSession, is_active: bool | None = None
) -> list[MembershipGrade]:
    return await repo.list_grades(db, is_active=is_active)


async def create_grade(
    db: AsyncSession, data: MembershipGradeCreate, actor: AdminUser
) -> MembershipGrade:
    if await repo.find_grade_by_code(db, data.code):
        raise api_error(
            "VALIDATION_ERROR", status_code=409, message="이미 등록된 등급 코드예요"
        )
    grade = MembershipGrade(**data.model_dump())
    db.add(grade)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="membership_grade.created",
        entity_type="membership_grade",
        entity_id=grade.id,
        after={"code": grade.code, "name": grade.name},
    )
    await db.commit()
    await db.refresh(grade)
    return grade


async def update_grade(
    db: AsyncSession, grade_id: uuid.UUID, data: MembershipGradeUpdate, actor: AdminUser
) -> MembershipGrade:
    grade = await repo.find_grade_by_id(db, grade_id)
    if grade is None:
        raise api_error("NOT_FOUND")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(grade, field, value)
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="membership_grade.updated",
        entity_type="membership_grade",
        entity_id=grade.id,
        after={k: str(v) for k, v in data.model_dump(exclude_unset=True).items()},
    )
    await db.commit()
    await db.refresh(grade)
    return grade


async def delete_grade(
    db: AsyncSession, grade_id: uuid.UUID, actor: AdminUser
) -> None:
    """소프트딜리트 — is_active false. 배정된 활성 교육생이 있으면 409 차단.

    과거 발급 신청 이력은 등급 id 스냅샷을 물고 있어 row 는 항상 남는다.
    """
    grade = await repo.find_grade_by_id(db, grade_id)
    if grade is None:
        raise api_error("NOT_FOUND")
    assigned = (
        await db.execute(
            select(Trainee.id)
            .where(
                Trainee.membership_grade_id == grade.id,
                Trainee.deleted_at.is_(None),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if assigned is not None:
        raise api_error(
            "GRADE_HAS_ACTIVE_TRAINEES",
            status_code=409,
            message="이 등급이 배정된 교육생이 있어요. 등급을 먼저 변경해 주세요",
        )
    grade.is_active = False
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="membership_grade.deleted",
        entity_type="membership_grade",
        entity_id=grade.id,
        before={"is_active": True},
        after={"is_active": False},
    )
    await db.commit()
