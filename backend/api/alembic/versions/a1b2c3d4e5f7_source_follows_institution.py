"""교육이력·일정 구분(source)을 기관 구분 규칙으로 재정렬 — '이관'(legacy_import) 폐지

운영 결정(2026-11-19): '이관' 표시는 더 이상 쓰지 않는다. 구분은 기관 구분 하나로 정한다.
- 지정된 사내(internal) 기관 → internal
- 그 외(외부·구분 미지정·기관 미연결) → external
  (외부교육 16시간 한도 판정 external_hours.is_external_type 과 같은 규칙)

데이터만 바꾼다(스키마 변경 없음). 한도·확인서 합계는 원래 기관 구분으로 판정하므로
이 마이그레이션으로 합계 숫자는 바뀌지 않는다 — 화면의 구분 표시만 규칙과 맞춰진다.

downgrade 는 되돌리지 않는다 — 어떤 행이 legacy_import 였는지 보존하지 않는 결정이다.

Revision ID: a1b2c3d4e5f7
Revises: d2e3f4a5b6c7
Create Date: 2026-11-19
"""

from alembic import op

revision = "a1b2c3d4e5f7"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE training_records r
        SET source = CASE WHEN i.institution_type = 'internal' THEN 'internal' ELSE 'external' END
        FROM training_records r2
        LEFT JOIN training_institutions i ON i.id = r2.institution_id
        WHERE r.id = r2.id
          AND r.source IS DISTINCT FROM
              CASE WHEN i.institution_type = 'internal' THEN 'internal' ELSE 'external' END
        """
    )
    op.execute(
        """
        UPDATE course_sessions s
        SET source = CASE WHEN i.institution_type = 'internal' THEN 'internal' ELSE 'external' END
        FROM training_courses c
        LEFT JOIN training_institutions i ON i.id = c.institution_id
        WHERE c.id = s.course_id
          AND s.source IS DISTINCT FROM
              CASE WHEN i.institution_type = 'internal' THEN 'internal' ELSE 'external' END
        """
    )
    op.execute(
        """
        UPDATE training_courses c
        SET is_external = (i.institution_type IS DISTINCT FROM 'internal')
        FROM training_institutions i
        WHERE i.id = c.institution_id
          AND c.is_external IS DISTINCT FROM (i.institution_type IS DISTINCT FROM 'internal')
        """
    )


def downgrade() -> None:
    # 데이터 정렬 마이그레이션 — 이전 표시(legacy_import 등)는 보존하지 않으므로 되돌리지 않는다
    pass
