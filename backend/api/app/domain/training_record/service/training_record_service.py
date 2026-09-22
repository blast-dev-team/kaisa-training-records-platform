import io
import secrets
import uuid
import zipfile
from decimal import Decimal

import openpyxl
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.auth.model import AdminUser
from app.domain.institution.repository import institution_repository as inst_repo
from app.domain.trainee.repository import trainee_repository as trainee_repo
from app.domain.training_record.model import TrainingRecord
from app.domain.training_record.repository import training_record_repository as repo
from app.domain.training_record.schema import (
    MatchPreviewMatched,
    MatchPreviewUnmatched,
    TraineeMatchPreviewResult,
    TrainingRecordBulkDelete,
    TrainingRecordBulkUpdate,
    TrainingRecordCreate,
    TrainingRecordUpdate,
)

ALLOWED_SOURCES = {"internal", "external", "legacy_import"}
ALLOWED_COMPLETION = {"in_progress", "completed", "canceled"}


def _record_no() -> str:
    """REC-{yyyymmdd}-{hex6} — 유니크 확률적 채번, unique 제약이 최종 방어."""
    return f"REC-{now_kst().strftime('%Y%m%d')}-{secrets.token_hex(3)}"


async def get_record(db: AsyncSession, record_id: uuid.UUID) -> TrainingRecord:
    record = await repo.find_by_id(db, record_id)
    if record is None:
        raise api_error("NOT_FOUND", message="교육이력을 찾을 수 없어요")
    return record


async def list_records(
    db: AsyncSession,
    trainee_id: uuid.UUID | None = None,
    session_id: uuid.UUID | None = None,
    source: str | None = None,
    exclude_source: str | None = None,
    completion_status: str | None = None,
    search: str | None = None,
    date_from=None,
    date_to=None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[TrainingRecord], int, Decimal]:
    return await repo.list_records(
        db,
        trainee_id=trainee_id,
        session_id=session_id,
        source=source,
        exclude_source=exclude_source,
        completion_status=completion_status,
        search=search,
        date_from=date_from,
        date_to=date_to,
        page=page,
        limit=limit,
    )


async def create_records_bulk(db: AsyncSession, data, actor: AdminUser) -> tuple[int, int]:
    """일정 → 교육생 일괄 연결. 로직은 course_session_service 쪽에 있다.

    (course_session_service 가 _record_no 를 가져다 쓰므로 lazy import — 순환 회피)
    """
    from app.domain.institution.service.course_session_service import (
        create_records_for_session,
    )

    records, skipped = await create_records_for_session(
        db,
        data.session_id,
        data.trainee_ids,
        data.completed_hours,
        data.completion_status,
        data.memo,
        actor,
    )
    return len(records), skipped


async def create_record(
    db: AsyncSession, data: TrainingRecordCreate, actor: AdminUser
) -> TrainingRecord:
    """스냅샷 자동 채움 — 마스터 연결 시 과정명·기관명·총시간을 마스터에서 가져온다."""
    if data.source not in ALLOWED_SOURCES:
        raise api_error("VALIDATION_ERROR", message="올바르지 않은 이력 출처예요")
    if data.completion_status not in ALLOWED_COMPLETION:
        raise api_error("VALIDATION_ERROR", message="올바르지 않은 수료 상태예요")

    trainee = await trainee_repo.find_by_id(db, data.trainee_id)
    if trainee is None:
        raise api_error("NOT_FOUND", message="회원을 찾을 수 없어요")

    course = None
    if data.course_id:
        course = await inst_repo.find_course_by_id(db, data.course_id)
        if course is None:
            raise api_error("NOT_FOUND", message="과정을 찾을 수 없어요")
    institution = None
    if data.institution_id:
        institution = await inst_repo.find_institution_by_id(db, data.institution_id)
        if institution is None:
            raise api_error("NOT_FOUND", message="교육기관을 찾을 수 없어요")

    course_name = course.name if course else data.course_name
    institution_name = institution.name if institution else data.institution_name
    if not course_name:
        raise api_error(
            "VALIDATION_ERROR", message="과정명 또는 과정 마스터 연결이 필요해요"
        )
    if not institution_name:
        raise api_error(
            "VALIDATION_ERROR", message="기관명 또는 기관 마스터 연결이 필요해요"
        )

    total_hours = data.total_hours
    if total_hours is None and course is not None:
        total_hours = course.total_hours

    # 확인서 표기용 감리원 정보 — 입력 없으면 교육생 마스터(감리원 등급)에서 자동 주입
    supervisor_grade = data.supervisor_grade or trainee.supervisor_grade
    supervisor_cert_no = data.supervisor_cert_no or trainee.cert_no
    record = TrainingRecord(
        training_record_no=_record_no(),
        trainee_id=data.trainee_id,
        course_id=data.course_id,
        institution_id=data.institution_id,
        course_name=course_name,
        institution_name=institution_name,
        form_no=data.form_no,
        doc_no=data.doc_no,
        supervisor_grade=supervisor_grade,
        supervisor_cert_no=supervisor_cert_no,
        total_hours=total_hours if total_hours is not None else 0,
        completed_hours=data.completed_hours,
        started_at=data.started_at,
        ended_at=data.ended_at,
        source=data.source,
        evidence_file_key=data.evidence_file_key,
        completion_status=data.completion_status,
        completed_at=now_kst() if data.completion_status == "completed" else None,
        memo=data.memo,
        created_by=actor.id,
        updated_by=actor.id,
    )
    db.add(record)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="training_record.created",
        entity_type="training_record",
        entity_id=record.id,
        after={
            "training_record_no": record.training_record_no,
            "trainee_id": str(record.trainee_id),
        },
    )
    await db.commit()
    await db.refresh(record)
    return record


async def update_record(
    db: AsyncSession, record_id: uuid.UUID, data: TrainingRecordUpdate, actor: AdminUser
) -> TrainingRecord:
    record = await get_record(db, record_id)
    updates = data.model_dump(exclude_unset=True)

    if (
        "completion_status" in updates
        and updates["completion_status"] not in ALLOWED_COMPLETION
    ):
        raise api_error("VALIDATION_ERROR", message="올바르지 않은 수료 상태예요")
    # 수료 확정 시각은 최초 completed 진입 시에만 남긴다
    if (
        updates.get("completion_status") == "completed"
        and record.completion_status != "completed"
    ):
        record.completed_at = now_kst()

    for field, value in updates.items():
        setattr(record, field, value)
    record.updated_by = actor.id
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="training_record.updated",
        entity_type="training_record",
        entity_id=record.id,
        after={k: str(v) for k, v in updates.items()},
    )
    await db.commit()
    await db.refresh(record)
    return record


async def bulk_update_records(
    db: AsyncSession, data: TrainingRecordBulkUpdate, actor: AdminUser
) -> int:
    """선택 이력 일괄 수정 — 행마다 전달된 필드만 바꾸고 한 트랜잭션으로 커밋.

    중간에 하나라도 실패하면 전체가 반영되지 않는다(부분 수정 없음).
    """
    updated = 0
    for item in data.updates:
        record = await get_record(db, item.id)
        updates = item.model_dump(exclude_unset=True, exclude={"id"})

        if (
            "completion_status" in updates
            and updates["completion_status"] is not None
            and updates["completion_status"] not in ALLOWED_COMPLETION
        ):
            raise api_error("VALIDATION_ERROR", message="올바르지 않은 수료 상태예요")
        # 수료 확정 시각은 최초 completed 진입 시에만 남긴다
        if (
            updates.get("completion_status") == "completed"
            and record.completion_status != "completed"
        ):
            record.completed_at = now_kst()

        # 과정 변경 — 과정 마스터 값으로 스냅샷(과정명·기관)을 같이 맞춘다
        if updates.get("course_id") is not None:
            course = await inst_repo.find_course_by_id(db, updates["course_id"])
            if course is None:
                raise api_error("NOT_FOUND", message="과정을 찾을 수 없어요")
            updates["institution_id"] = course.institution_id
            record.course_name = course.name
            record.institution_name = course.institution.name

        for field, value in updates.items():
            setattr(record, field, value)
        record.updated_by = actor.id
        record_audit(
            db,
            actor_admin_id=actor.id,
            action="training_record.updated",
            entity_type="training_record",
            entity_id=record.id,
            after={k: str(v) for k, v in updates.items()},
        )
        updated += 1

    await db.commit()
    return updated


async def bulk_delete_records(
    db: AsyncSession, data: TrainingRecordBulkDelete, actor: AdminUser
) -> int:
    """선택 이력 일괄 소프트딜리트 — 단건 삭제와 동일, 한 트랜잭션으로 커밋."""
    deleted = 0
    for record_id in dict.fromkeys(data.ids):  # 요청 내 중복 제거
        record = await get_record(db, record_id)
        record.deleted_at = now_kst()
        record.updated_by = actor.id
        record_audit(
            db,
            actor_admin_id=actor.id,
            action="training_record.deleted",
            entity_type="training_record",
            entity_id=record.id,
        )
        deleted += 1
    await db.commit()
    return deleted


async def delete_record(
    db: AsyncSession, record_id: uuid.UUID, actor: AdminUser
) -> None:
    """소프트딜리트 — deleted_at 만 marking. 발급 이력 정합성 보존."""
    record = await get_record(db, record_id)
    record.deleted_at = now_kst()
    record.updated_by = actor.id
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="training_record.deleted",
        entity_type="training_record",
        entity_id=record.id,
    )
    await db.commit()


# ── 엑셀 → 교육생 대조 (일정 연결 자동 선택용) ────────────────────────────────

# 헤더명 유동 — 후보 중 첫 매칭 컬럼을 쓴다(순서 무관)
_MATCH_HEADERS = {
    "name": ("교육생명", "감리원명", "성명", "이름"),
    "trainee_no": ("교육생번호", "교육번", "회원번호", "번호"),
    "cert_no": ("감리원증번호", "감리원증 번호", "증번호", "자격번호"),
}
_MATCH_MAX_ROWS = 1000


def _match_cell_str(value) -> str | None:
    """셀 값 → 문자열. 엑셀 수치 셀은 123.0 처럼 오므로 정수면 소수점을 뗀다."""
    if value is None or str(value).strip() == "":
        return None
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


async def match_preview(db: AsyncSession, content: bytes) -> TraineeMatchPreviewResult:
    """엑셀 행을 교육생과 대조 — 매칭된 교육생 목록을 돌려준다(연결 전 자동 선택용).

    대조 우선순위: 감리원증번호 → 교육생번호 → 이름. 이름 단독은 동명이인이
    2명 이상이면 미매칭으로 돌려 사용자가 수동으로 고르게 한다.
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
    columns = {
        field: next((label for label in candidates if label in header_map), None)
        for field, candidates in _MATCH_HEADERS.items()
    }
    if columns["name"] is None and columns["cert_no"] is None and columns["trainee_no"] is None:
        raise api_error(
            "VALIDATION_ERROR",
            message="엑셀 헤더에서 교육생명·감리원증번호·교육생번호 중 하나를 찾지 못했어요",
        )

    parsed: list[dict] = []
    for offset, row in enumerate(rows[1:], start=2):
        if offset > _MATCH_MAX_ROWS + 1:
            raise api_error(
                "VALIDATION_ERROR",
                message=f"한 번에 대조할 수 있는 행은 {_MATCH_MAX_ROWS}개까지예요",
            )
        cells = {
            field: (
                _match_cell_str(row[header_map[columns[field]]]) if columns[field] else None
            )
            for field in _MATCH_HEADERS
        }
        if not any(cells.values()):
            continue  # 완전히 빈 행
        if cells["name"] is None and cells["cert_no"] is None and cells["trainee_no"] is None:
            continue  # 판단 근거가 하나도 없는 행
        parsed.append({"row_number": offset, **cells})

    candidates = await trainee_repo.find_by_identifiers(
        db,
        names=sorted({r["name"] for r in parsed if r["name"]}),
        cert_nos=sorted({r["cert_no"] for r in parsed if r["cert_no"]}),
        trainee_nos=sorted({r["trainee_no"] for r in parsed if r["trainee_no"]}),
    )
    by_cert: dict[str, list] = {}
    by_trainee_no: dict[str, list] = {}
    by_name: dict[str, list] = {}
    for t in candidates:
        if t.cert_no:
            by_cert.setdefault(t.cert_no, []).append(t)
        if t.trainee_no:
            by_trainee_no.setdefault(t.trainee_no, []).append(t)
        by_name.setdefault(t.name, []).append(t)

    matched: list[MatchPreviewMatched] = []
    unmatched: list[MatchPreviewUnmatched] = []
    seen: set[uuid.UUID] = set()
    for r in parsed:
        hit = None
        matched_by = ""
        for field, index in (("cert_no", by_cert), ("trainee_no", by_trainee_no), ("name", by_name)):
            if r[field] is None:
                continue
            hits = index.get(r[field], [])
            if len(hits) == 1:
                hit, matched_by = hits[0], field
                break
            if len(hits) > 1:
                hit = "AMBIGUOUS"  # 이 키로는 판단 불가 — 다음 키로 이어서 시도
        if hit == "AMBIGUOUS":
            unmatched.append(
                MatchPreviewUnmatched(
                    row_number=r["row_number"],
                    name=r["name"],
                    cert_no=r["cert_no"],
                    reason="동일한 이름·번호의 교육생이 여러 명이에요 — 수동으로 선택해 주세요",
                )
            )
            continue
        if hit is None:
            unmatched.append(
                MatchPreviewUnmatched(
                    row_number=r["row_number"],
                    name=r["name"],
                    cert_no=r["cert_no"],
                    reason="교육생 목록에서 찾을 수 없어요",
                )
            )
            continue
        if hit.id in seen:
            unmatched.append(
                MatchPreviewUnmatched(
                    row_number=r["row_number"],
                    name=r["name"],
                    cert_no=r["cert_no"],
                    reason="엑셀 안에서 중복된 교육생이에요",
                )
            )
            continue
        seen.add(hit.id)
        matched.append(
            MatchPreviewMatched(
                trainee_id=hit.id,
                name=hit.name,
                trainee_no=hit.trainee_no,
                cert_no=hit.cert_no,
                matched_by=matched_by,
            )
        )

    return TraineeMatchPreviewResult(
        total_rows=len(parsed), matched=matched, unmatched=unmatched
    )
