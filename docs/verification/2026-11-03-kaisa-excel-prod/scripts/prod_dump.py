"""Prod DB full dump — runs INSIDE api-api-1 container (has DATABASE_URL + CRYPTO_KEY).
Outputs marker-separated CSV sections to stdout.
"""
import asyncio, csv, io, os, sys

import asyncpg

sys.path.insert(0, "/app")
from app.core.crypto import decrypt_field  # noqa: E402

QUERIES = {
    "TRAINEES": """SELECT id::text, trainee_no, cert_no, senior_cert_no, supervisor_grade,
            cert_issued_date, birth_date, membership_grade_id::text, grade_expires_at,
            review_status, deleted_at, created_at, name_encrypted
        FROM trainees ORDER BY trainee_no NULLS LAST, created_at""",
    "RECORDS": """SELECT id::text, training_record_no, trainee_id::text, course_id::text,
            session_id::text, institution_id::text, course_name, institution_name,
            total_hours, completed_hours, started_at, ended_at, source, is_demo,
            completion_status, memo, deleted_at, created_at, updated_at
        FROM training_records ORDER BY training_record_no""",
    "COURSES": """SELECT id::text, course_code, name, session_name_id::text,
            institution_id::text, category, is_external, total_hours
        FROM training_courses ORDER BY course_code NULLS LAST""",
    "SESSIONS": """SELECT id::text, course_id::text, schedule_no, started_at, ended_at,
            total_hours, recognized_hours FROM course_sessions ORDER BY schedule_no NULLS LAST""",
    "INSTITUTIONS": "SELECT id::text, name FROM training_institutions ORDER BY name",
    "GRADES": "SELECT id::text, name FROM membership_grades ORDER BY name",
    "GRADE_HIST": """SELECT trainee_id::text, previous_grade_id::text, new_grade_id::text,
            change_reason, changed_at FROM trainee_grade_histories ORDER BY changed_at""",
}

DSN = os.environ["DATABASE_URL"].replace("+asyncpg", "")


async def main():
    conn = await asyncpg.connect(DSN)
    out = io.StringIO()
    for section, q in QUERIES.items():
        rows = await conn.fetch(q)
        buf = io.StringIO()
        w = csv.writer(buf, lineterminator="\n")
        if rows:
            w.writerow(list(rows[0].keys()))
            for r in rows:
                vals = []
                for k in rows[0].keys():
                    v = r[k]
                    if k == "name_encrypted":
                        v = decrypt_field(v)
                    elif hasattr(v, "isoformat"):
                        v = v.isoformat()
                    vals.append("" if v is None else str(v))
                w.writerow(vals)
        out.write(f"=== {section} ===\n")
        out.write(buf.getvalue())
    await conn.close()
    sys.stdout.write(out.getvalue())


asyncio.run(main())
