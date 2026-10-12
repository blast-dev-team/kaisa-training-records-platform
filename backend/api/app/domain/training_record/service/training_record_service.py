import io
import re
import secrets
import uuid
import zipfile
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import openpyxl
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.crypto import decrypt_field, name_hash
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.auth.model import AdminUser
from app.domain.institution.repository import institution_repository as inst_repo
from app.domain.trainee.repository import trainee_repository as trainee_repo
from app.domain.institution.model.training_course import TrainingCourse
from app.domain.institution.model.training_institution import TrainingInstitution
from app.domain.training_record.model import TrainingRecord
from app.domain.training_record.repository import training_record_repository as repo
from app.domain.training_record.schema import (
    TrainingRecordImportRow,
    TrainingRecordImportConfirmRequest,
    TrainingRecordImportPreviewResult,
    TrainingRecordImportResult,
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
    sort: str = "period",
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
        sort=sort,
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
    # 시수는 총 시수 하나로 관리 — 이수 시수는 총 시수를 그대로 인정한다
    completed_hours = total_hours if total_hours is not None else Decimal(0)

    # savepoint 재시도 — training_record_no 가 확률적 채번이라 충돌 시 재생성
    record: TrainingRecord | None = None
    for _ in range(5):
        try:
            async with db.begin_nested():
                record = TrainingRecord(
                    training_record_no=_record_no(),
                    trainee_id=data.trainee_id,
                    course_id=data.course_id,
                    institution_id=data.institution_id,
                    course_name=course_name,
                    institution_name=institution_name,
                    total_hours=total_hours if total_hours is not None else 0,
                    completed_hours=completed_hours,
                    started_at=data.started_at,
                    ended_at=data.ended_at,
                    source=data.source,
                    evidence_file_key=data.evidence_file_key,
                    completion_status=data.completion_status,
                    completed_at=now_kst()
                    if data.completion_status == "completed"
                    else None,
                    memo=data.memo,
                    created_by=actor.id,
                    updated_by=actor.id,
                )
                db.add(record)
                await db.flush()
        except IntegrityError:
            continue
        break
    if record is None:  # 5회 재시도 후에도 유니크 충돌 — 사실상 없음
        raise api_error("INTERNAL_ERROR", message="문서번호 채번에 실패했어요")
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
    # 시수는 총 시수 하나로 관리 — 이수 시수는 총 시수를 따라간다
    if "total_hours" in updates:
        record.completed_hours = record.total_hours
    record.updated_by = actor.id
    after = {k: str(v) for k, v in updates.items()}
    if "total_hours" in updates:
        after["completed_hours"] = str(record.completed_hours)
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="training_record.updated",
        entity_type="training_record",
        entity_id=record.id,
        after=after,
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
        # 시수는 총 시수 하나로 관리 — 이수 시수는 총 시수를 따라간다
        if "total_hours" in updates:
            record.completed_hours = record.total_hours
        record.updated_by = actor.id
        after = {k: str(v) for k, v in updates.items()}
        if "total_hours" in updates:
            after["completed_hours"] = str(record.completed_hours)
        record_audit(
            db,
            actor_admin_id=actor.id,
            action="training_record.updated",
            entity_type="training_record",
            entity_id=record.id,
            after=after,
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
        # 성명은 암호화 저장 — blind index 해시를 대조 키로 쓴다
        by_name.setdefault(t.name_hash, []).append(t)

    matched: list[MatchPreviewMatched] = []
    unmatched: list[MatchPreviewUnmatched] = []
    seen: set[uuid.UUID] = set()
    for r in parsed:
        hit = None
        matched_by = ""
        for field, index in (("cert_no", by_cert), ("trainee_no", by_trainee_no), ("name", by_name)):
            if r[field] is None:
                continue
            # 이름 키는 엑셀 원문을 해시해 비교한다
            lookup = name_hash(r[field]) if field == "name" else r[field]
            hits = index.get(lookup, [])
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
                name=decrypt_field(hit.name_encrypted),
                trainee_no=hit.trainee_no,
                cert_no=hit.cert_no,
                matched_by=matched_by,
            )
        )

    return TraineeMatchPreviewResult(
        total_rows=len(parsed), matched=matched, unmatched=unmatched
    )


# ── 엑셀 → 교육내역 일괄 등록 ────────────────────────────────────────────────

_IMPORT_HEADERS = {
    "name": ("교육생명", "감리원명", "성명", "이름", "회원명"),
    "cert_no": ("감리원증번호", "감리원증 번호", "증번호", "자격번호", "감리원증"),
    "institution": ("교육기관명", "기관명", "교육기관", "주관기관", "기관"),
    "subject": ("과목명", "교육과목", "과정명", "교육명", "교육내용", "과목"),
    "start": ("시작일자", "시작일", "교육시작일", "시작"),
    "end": ("종료일자", "종료일", "교육종료일", "종료"),
    "hours_total": ("교육시간", "총시간", "시간"),
    "hours_recog": ("인정시간", "이수시간", "인정"),
}
_IMPORT_MAX_ROWS = 1000


def _import_cell(value) -> str | None:
    if value is None or str(value).strip() == "":
        return None
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _import_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value).strip()
    m = re.fullmatch(r"(\d{4})[.\-/\s](\d{1,2})[.\-/\s](\d{1,2})", s)
    if m:
        try:
            return date(int(m[1]), int(m[2]), int(m[3]))
        except ValueError:
            return None
    return None


def _import_hours(value) -> Decimal | None:
    v = _import_cell(value)
    if v is None:
        return None
    try:
        return Decimal(v)
    except InvalidOperation:
        return None


async def import_preview(db: AsyncSession, content: bytes) -> TrainingRecordImportPreviewResult:
    """교육내역 엑셀 파싱 + 감리원 매칭 — 확정 전 프리뷰용.

    감리원 매칭은 감리원증번호(cert_no·senior_cert_no 양쪽) → 이름 순으로 하고,
    이름은 동명이인이 2명 이상이면 미매칭으로 돌려 사용자가 수동으로 고르게 한다.
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

    # 헤더 행 탐색 — 제목·안내 행이 위에 있어도 찾도록 상단 10행을 훑고,
    # 비교 시 공백을 제거한다("감리원증 번호" == "감리원증번호")
    def _norm_header(v) -> str:
        return re.sub(r"\s+", "", str(v)) if v is not None else ""

    best_idx, best_map, best_score = None, None, 0
    for idx, row in enumerate(rows[:10]):
        hmap = {_norm_header(c): i for i, c in enumerate(row) if c is not None}
        score = sum(
            1
            for cands in _IMPORT_HEADERS.values()
            for cand in cands
            if _norm_header(cand) in hmap
        )
        if score > best_score:
            best_idx, best_map, best_score = idx, hmap, score
    if best_idx is None or best_score < 2:
        first = next((r for r in rows if any(c is not None for c in r)), [])
        preview = [str(c)[:20] for c in first if c is not None][:8]
        raise api_error(
            "VALIDATION_ERROR",
            message=(
                "엑셀 헤더에서 교육생명·감리원증번호·교육기관명·과목명을 찾지 못했어요 — "
                f"인식된 첫 행: {preview if preview else '빈 파일'}"
            ),
        )

    # 헤더 할당 — 정확 일치 우선, 배정 못 한 필드는 포함 관계(부분 일치)로 보조 매칭.
    # 한 헤더를 두 필드가 가져가지 않도록 배정된 헤더는 claimed 로 잠근다
    claimed: set[str] = set()
    columns: dict[str, str | None] = {}
    for field, candidates in _IMPORT_HEADERS.items():
        for cand in candidates:
            c = _norm_header(cand)
            if c in best_map and c not in claimed:
                columns[field] = c
                claimed.add(c)
                break
        else:
            columns[field] = None
    for field, candidates in _IMPORT_HEADERS.items():
        if columns[field] is not None:
            continue
        for cand in candidates:
            c = _norm_header(cand)
            if len(c) < 2:
                continue
            for h in best_map:
                if h in claimed:
                    continue
                if c in h or h in c:
                    columns[field] = h
                    claimed.add(h)
                    break
            if columns[field] is not None:
                break
    header_map = best_map

    parsed: list[dict] = []
    for offset, row in enumerate(rows[best_idx + 1:], start=best_idx + 2):
        if offset > best_idx + _IMPORT_MAX_ROWS + 1:
            raise api_error(
                "VALIDATION_ERROR",
                message=f"한 번에 등록할 수 있는 행은 {_IMPORT_MAX_ROWS}개까지예요",
            )
        cells = {
            field: (
                _import_cell(row[header_map[columns[field]]]) if columns[field] else None
            )
            for field in _IMPORT_HEADERS
        }
        if not any(cells.values()):
            continue  # 완전히 빈 행
        parsed.append({"row_number": offset, **cells})

    candidates = await trainee_repo.find_by_identifiers(
        db,
        names=sorted({r["name"] for r in parsed if r["name"]}),
        cert_nos=sorted({r["cert_no"] for r in parsed if r["cert_no"]}),
        trainee_nos=[],
    )
    by_cert: dict[str, list] = {}
    by_name: dict[str, list] = {}
    for t in candidates:
        for no in (t.cert_no, t.senior_cert_no):
            if no:
                by_cert.setdefault(no.strip(), []).append(t)
        by_name.setdefault(t.name_hash, []).append(t)

    existing_inst_names = {
        n for (n,) in (await db.execute(
            select(TrainingInstitution.name)
        )).fetchall()
    }
    existing_course_keys = {
        (name, iid) for name, iid in (await db.execute(
            select(TrainingCourse.name, TrainingCourse.institution_id)
        )).fetchall()
    }
    inst_name_to_id: dict[str, str] = {}
    for iid, name in (await db.execute(
        select(TrainingInstitution.id, TrainingInstitution.name)
    )).fetchall():
        inst_name_to_id[name] = iid

    result_rows: list[TrainingRecordImportRow] = []
    for r in parsed:
        errors: list[str] = []
        institution_exists = r["institution"] in existing_inst_names if r["institution"] else True
        course_exists = True
        if r["institution"] and r["subject"]:
            iid = inst_name_to_id.get(r["institution"])
            course_exists = iid is not None and (r["subject"], iid) in existing_course_keys
        trainee_id = trainee_name = None
        if not r["institution"]:
            errors.append("교육기관명이 필요해요")
        if not r["subject"]:
            errors.append("과목명이 필요해요")
        if r["start"] and _import_date(r["start"]) is None:
            errors.append("시작일자를 읽을 수 없어요 (예: 2025.06.01)")
        if r["end"] and _import_date(r["end"]) is None:
            errors.append("종료일자를 읽을 수 없어요 (예: 2025.06.30)")

        hit = None
        if r["cert_no"]:
            hits = by_cert.get(r["cert_no"].strip(), [])
            if len(hits) == 1:
                hit = hits[0]
            elif len(hits) > 1:
                errors.append("동일한 감리원증번호의 감리원이 여러 명이에요")
        if hit is None and r["name"]:
            hits = by_name.get(name_hash(r["name"]), [])
            if len(hits) == 1:
                hit = hits[0]
            elif len(hits) > 1:
                errors.append("동일한 이름의 감리원이 여러 명이에요 — 감리원증번호로 구분해 주세요")
        if hit is None and not any("감리원" in e for e in errors):
            errors.append("감리원을 찾을 수 없어요")

        if hit is not None and not any("감리원" in e for e in errors):
            trainee_id = hit.id
            trainee_name = decrypt_field(hit.name_encrypted)

        result_rows.append(
            TrainingRecordImportRow(
                row_number=r["row_number"],
                name=r["name"],
                cert_no=r["cert_no"],
                institution=r["institution"],
                subject=r["subject"],
                start_date=r["start"],
                end_date=r["end"],
                hours_total=r["hours_total"],
                hours_recog=r["hours_recog"],
                institution_exists=institution_exists,
                course_exists=course_exists,
                trainee_id=trainee_id,
                trainee_name=trainee_name,
                errors=errors,
            )
        )
    return TrainingRecordImportPreviewResult(rows=result_rows, total=len(result_rows))


async def import_confirm(
    db: AsyncSession, data: TrainingRecordImportConfirmRequest, actor: AdminUser
) -> tuple[int, int, list[tuple[int, str]]]:
    """프리뷰에서 확정한 행을 교육내역으로 일괄 등록 — 외부 교육 이력(회차 없음)으로 생성.

    같은 감리원·과정·시작일의 기존 이력은 중복으로 건너뛴다.
    """
    created = skipped = 0
    failed: list[tuple[int, str]] = []
    for item in data.rows:
        trainee = await trainee_repo.find_by_id(db, item.trainee_id)
        if trainee is None:
            failed.append((item.row_number, "감리원을 찾을 수 없어요"))
            continue
        if not item.institution or not item.subject:
            failed.append((item.row_number, "기관명·과목명이 필요해요"))
            continue

        started = _import_date(item.start_date)
        ended = _import_date(item.end_date)
        # 기관 매칭 — 내부 기관(internal)이면 내부 데이터로 그대로 등록하고,
        # 매칭되지 않으면 외부 기관·외부 교육으로 등록한다.
        institution = (
            await db.execute(
                select(TrainingInstitution).where(
                    TrainingInstitution.name == item.institution
                )
            )
        ).scalar_one_or_none()
        if institution is None:
            institution = TrainingInstitution(
                name=item.institution, institution_type="external"
            )
            db.add(institution)
            await db.flush()
        is_internal = institution.institution_type == "internal"
        course = (
            await db.execute(
                select(TrainingCourse).where(
                    TrainingCourse.institution_id == institution.id,
                    TrainingCourse.name == item.subject,
                )
            )
        ).scalar_one_or_none()
        if course is None:
            course = TrainingCourse(
                institution_id=institution.id,
                name=item.subject,
                is_external=not is_internal,
            )
            db.add(course)
            await db.flush()
        source = "internal" if is_internal else "external"

        if started is not None:
            dup = (
                await db.execute(
                    select(TrainingRecord.id).where(
                        TrainingRecord.trainee_id == trainee.id,
                        TrainingRecord.course_name == item.subject,
                        TrainingRecord.started_at == started,
                        TrainingRecord.deleted_at.is_(None),
                    )
                )
            ).scalar_one_or_none()
            if dup is not None:
                skipped += 1  # 같은 감리원·과정·시작일 기존 이력
                continue

        hours = _import_hours(item.hours_recog) or _import_hours(item.hours_total) or Decimal(0)
        saved = False
        for _ in range(5):
            try:
                async with db.begin_nested():
                    db.add(
                        TrainingRecord(
                            training_record_no=_record_no(),
                            trainee_id=trainee.id,
                            course_id=course.id,
                            institution_id=institution.id,
                            course_name=course.name,
                            institution_name=institution.name,
                            total_hours=hours,
                            completed_hours=hours,
                            started_at=started,
                            ended_at=ended,
                            source=source,
                            completion_status="completed",
                            completed_at=now_kst(),
                            created_by=actor.id,
                            updated_by=actor.id,
                        )
                    )
            except IntegrityError:
                continue  # 번호 충돌 — 재채번
            saved = True
            break
        if saved:
            created += 1
        else:
            failed.append((item.row_number, "이력 번호 채번에 반복 실패했어요"))
    await db.commit()
    return created, skipped, failed
