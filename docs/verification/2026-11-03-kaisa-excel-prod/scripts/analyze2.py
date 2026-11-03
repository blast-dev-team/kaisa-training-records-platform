"""2차 정밀 분석 — 1차 패스의 미분류 항목 원인 규명."""
import csv
import json
import re
from collections import Counter, defaultdict

C = "/tmp/kaisa_verify/canonical"
P = "/tmp/kaisa_verify/prod"
R = "/tmp/kaisa_verify/report"

def load_json(p):
    return json.load(open(p))

new = load_json(f"{C}/master_new.json")
old = load_json(f"{C}/master_old.json")
add0928 = load_json(f"{C}/add_0928.json")
new_course_by_sn = {c["sn"]: c for c in new["courses"]}

trainees = list(csv.DictReader(open(f"{P}/trainees.csv")))
records = list(csv.DictReader(open(f"{P}/records.csv")))
courses = list(csv.DictReader(open(f"{P}/courses.csv")))
sessions = list(csv.DictReader(open(f"{P}/sessions.csv")))

live = [r for r in records if not r["deleted_at"]]
db_rec_by_no = {r["training_record_no"]: r for r in live}
db_course_by_code = {c["course_code"]: c for c in courses if c["course_code"]}
db_tr_by_no = {t["trainee_no"]: t for t in trainees if t["trainee_no"]}
db_tr_by_cert = defaultdict(list)
db_tr_by_sencert = defaultdict(list)
for t in trainees:
    if t["cert_no"]:
        db_tr_by_cert[t["cert_no"].strip()].append(t)
    if t["senior_cert_no"]:
        db_tr_by_sencert[t["senior_cert_no"].strip()].append(t)
db_tr_by_id = {t["id"]: t for t in trainees}

out = {}

# ---- A. S1 missing 318 재분류 ----------------------------------------
s1 = load_json(f"{R}/S1_supervisors.json")
missing = s1["missing_in_db"]
reclass = Counter()
tr_found, sencert_found, truly_missing = [], [], []
add0928_certs = {a["cert_no"] for a in add0928 if a["cert_no"]}
for m in missing:
    cert = (m["cert_no"] or "").strip()
    hits = db_tr_by_cert.get(cert, []) + db_tr_by_sencert.get(cert, [])
    if hits:
        t = hits[0]
        entry = {"no": m["no"], "name": m["name"], "cert": m["cert_no"],
                 "excel_grade": m["grade"], "db_trainee_no": t["trainee_no"],
                 "db_grade": t["supervisor_grade"],
                 "grade_match": (t["supervisor_grade"] or "") == (m["grade"] or "")}
        if t["trainee_no"] in add0928_certs or t["trainee_no"].startswith("TR-"):
            tr_found.append(entry)
            reclass["TR_행으로_존재"] += 1
        else:
            sencert_found.append(entry)
            reclass["다른_EDU로_존재"] += 1
    else:
        truly_missing.append(m)
        reclass["진짜_누락"] += 1
# TR 매칭 시 등급 일치 여부
tr_grade_mismatch = [e for e in tr_found + sencert_found if not e["grade_match"]]
out["A_s1_missing_reclass"] = {
    "total": len(missing), "by_class": dict(reclass),
    "tr_found": tr_found, "other_edu_found": sencert_found,
    "truly_missing": truly_missing,
    "grade_mismatch_when_found": tr_grade_mismatch,
}

# ---- B. TR-* 미매칭 61명 상세 ----------------------------------------
all_excel_certs = set()
for src in (new["supervisors"], add0928):
    for s in src:
        if s.get("cert_no"):
            all_excel_certs.add(s["cert_no"].strip())
tr_unmatched = []
for t in trainees:
    if (t["trainee_no"] or "").startswith("TR-") and (t["cert_no"] or "").strip() not in all_excel_certs:
        tr_unmatched.append({k: t[k] for k in ("trainee_no", "cert_no", "senior_cert_no",
                                               "supervisor_grade", "birth_date", "created_at",
                                               "name_encrypted", "review_status")})
out["B_tr_unmatched"] = tr_unmatched

# ---- C. S2 enr_diff 3019 성격 규명 -----------------------------------
s2 = load_json(f"{R}/S2_legacy_edc.json")
diffs = s2["field_diffs"]
kinds = Counter()
for d in diffs:
    ks = tuple(k for k in ("hours", "start", "end") if k in d)
    kinds[ks] += 1
# 날짜-only 케이스 샘플: schdl 중복 여부 조사
schdl_counts = Counter(s["schdl_sn"] for s in new["sessions"])
dup_schdls = {k for k, v in schdl_counts.items() if v > 1}
date_only = [d for d in diffs if "start" in d or "end" in d]
dup_in_date_only = sum(1 for d in date_only
                       if "-".join(d["record_no"].split("-")[2:3]) and
                       int(d["record_no"].split("-")[2]) in dup_schdls)
sample = date_only[:12]
hours_only = [d for d in diffs if "hours" in d and "start" not in d and "end" not in d]
out["C_s2_diff_analysis"] = {
    "kinds": {"|".join(k): v for k, v in kinds.items()},
    "date_only_total": len(date_only),
    "date_only_dup_schdl": dup_in_date_only,
    "date_only_dup_schdl_total_schdls": len(dup_schdls),
    "hours_only_total": len(hours_only),
    "date_samples": sample,
    "hours_samples": hours_only[:12],
}

# ---- D. S2 missing 278 재분류 ----------------------------------------
# NEW-only 122 제외하고 OLD 기준 missing 분석
old_enr_keys = {(e["schdl_sn"], e["partc_no"]) for e in old["enrollments"]
                if e["schdl_sn"] is not None and e["partc_no"] is not None}
s2_missing = s2["missing_in_db"]
old_missing = [e for e in s2_missing
               if (e["schdl_sn"], e["partc_no"]) not in old_enr_keys]
new_missing = [e for e in s2_missing if (e["schdl_sn"], e["partc_no"]) in old_enr_keys]
# OLD-missing 원인: 세션/과정 연결 가능 여부
canon_sessions_by_no = {}
for s in new["sessions"]:
    canon_sessions_by_no.setdefault(s["schdl_sn"], s)
cause = Counter()
old_missing_detail = []
for e in old_missing:
    s = canon_sessions_by_no.get(e["schdl_sn"])
    if s is None:
        # fallback 경로: 회차명+과목명으로 course 존재?
        cname = None
        for c in new["courses"]:
            pass
        cause["세션_없음(fallback대상)"] += 1
        old_missing_detail.append({"row": e["row"], "schdl": e["schdl_sn"],
                                   "partc": e["partc_no"], "name": e["name"],
                                   "session_name": e["session_name"], "subject": e["subject"],
                                   "cause": "no_session"})
    else:
        course = db_course_by_code.get(f"EDC-{s['edc_sn']}")
        if course is None:
            cause["과정누락으로_연쇄"] += 1
            old_missing_detail.append({"row": e["row"], "schdl": e["schdl_sn"],
                                       "partc": e["partc_no"], "name": e["name"],
                                       "subject": e["subject"], "cause": "course_missing"})
        else:
            cause["원인불명(DB에 있어야 함)"] += 1
            old_missing_detail.append({"row": e["row"], "schdl": e["schdl_sn"],
                                       "partc": e["partc_no"], "name": e["name"],
                                       "subject": e["subject"], "cause": "UNKNOWN"})
out["D_s2_missing_reclass"] = {
    "missing_total": len(s2_missing),
    "new_file_only_not_yet_imported": len(new_missing),
    "old_basis_missing": len(old_missing),
    "cause": dict(cause),
    "unknown_detail": [d for d in old_missing_detail if d["cause"] == "UNKNOWN"],
    "no_session_detail": [d for d in old_missing_detail if d["cause"] == "no_session"][:30],
    "course_missing_detail": [d for d in old_missing_detail if d["cause"] == "course_missing"][:30],
}

# ---- E. S3 external missing 15 원인 ----------------------------------
s3 = load_json(f"{R}/S3_external_batches.json")
ext_missing_detail = []
for e in s3["external_missing"]:
    cert = (e["cert_no"] or "").strip()
    hits = db_tr_by_cert.get(cert, []) + db_tr_by_sencert.get(cert, [])
    ext_missing_detail.append({
        "rowno": e["rowno"], "inst": e["institution"], "subject": e["subject"],
        "start": e["start"], "end": e["end"], "hours": e["hours"],
        "name": e["name"], "cert": e["cert_no"],
        "cert_matches_in_db": len(hits),
        "match_nos": [h["trainee_no"] for h in hits],
    })
out["E_ext_missing_detail"] = ext_missing_detail
out["E_ext_diff"] = s3["external_diffs"]
out["E_oct_mismatch"] = s3["batch_1012_oct"]["field_mismatch"]
out["E_oct_extra"] = s3["batch_1012_oct"]["db_extra"]

# ---- F. S4 과정/일정 누락 재분류 --------------------------------------
s4 = load_json(f"{R}/S4_courses_sessions.json")
course_missing_reclass = Counter()
course_truly_missing = []
for c in s4["courses_missing"]:
    # 임포트 규칙: subject/institution 결측 제외
    if not c["subject"] or not c["institution"]:
        course_missing_reclass["결측_제외(의도)"] += 1
    else:
        course_missing_reclass["과목·기관_있음(검토)"] += 1
        course_truly_missing.append(c)
# 일정: 과정이 DB에 있는데 일정만 없는 케이스
ses_reclass = Counter()
ses_truly = []
for s in s4["sessions_missing_in_db"]:
    course = db_course_by_code.get(f"EDC-{s['edc_sn']}")
    if course is None:
        # 과정 자체가 없으면(결측 제외분 or 미이관) 일정도 못 만듦
        src_course = new_course_by_sn.get(s["edc_sn"])
        if src_course is None or not src_course["subject"] or not src_course["institution"]:
            ses_reclass["과정결측_연쇄(의도)"] += 1
        else:
            ses_reclass["과정미이관_연쇄"] += 1
    else:
        ses_reclass["과정있음_일정만누락"] += 1
        ses_truly.append(s)
# 날짜불일치 666 성격: schdl 중복 포함 여부 + 실제 차이 종류
date_diffs = s4["session_date_diffs"]
dd_kinds = Counter()
for d in date_diffs:
    dd_kinds["|".join(k for k in ("start", "end") if k in d)] += 1
dd_dup = sum(1 for d in date_diffs if d["schdl_sn"] in dup_schdls)
out["F_s4_reclass"] = {
    "course_missing": {"total": len(s4["courses_missing"]),
                       "by_class": dict(course_missing_reclass),
                       "truly": course_truly_missing[:40]},
    "session_missing": {"total": len(s4["sessions_missing_in_db"]),
                        "by_class": dict(ses_reclass),
                        "truly": ses_truly[:40]},
    "date_diffs": {"total": len(date_diffs), "kinds": dict(dd_kinds),
                   "dup_schdl_involved": dd_dup,
                   "non_dup_samples": [d for d in date_diffs if d["schdl_sn"] not in dup_schdls][:20]},
}

# ---- G. S6 등급 상세 ---------------------------------------------------
s6 = load_json(f"{R}/S6_grades.json")
out["G_grade_diffs"] = s6["sup_grade_diffs"][:80]
out["G_member_notfound"] = s6["member_not_found_in_db"]
# 9/30 이후 생성 교육생 (요청건 회원추가분)
recent_tr = [t for t in trainees if t["created_at"][:10] > "2026-09-19"]
out["G_recent_trainees"] = [{"trainee_no": t["trainee_no"], "cert": t["cert_no"],
                             "senior": t["senior_cert_no"], "grade": t["supervisor_grade"],
                             "birth": t["birth_date"], "created": t["created_at"][:10],
                             "name": t["name_encrypted"], "membership": t["membership_grade_id"][:8] if t["membership_grade_id"] else ""}
                            for t in recent_tr]

json.dump(out, open(f"{R}/analysis2.json", "w"), ensure_ascii=False, indent=1)

print("A. S1 missing 318:", dict(reclass))
print("   등급 불일치(존재하나):", len(tr_grade_mismatch))
print("B. TR 미매칭:", len(tr_unmatched))
print("C. S2 diff kinds:", dict(out["C_s2_diff_analysis"]["kinds"]))
print("   date_only:", len(date_only), "dup_schdl:", dup_in_date_only, "/", len(dup_schdls), "종")
print("   hours_only:", len(hours_only))
print("D. S2 missing:", dict(cause), "| new_only:", len(new_missing), "| old:", len(old_missing))
print("E. ext missing:", len(ext_missing_detail))
print("F. course missing:", dict(course_missing_reclass))
print("   session missing:", dict(ses_reclass))
print("   date diffs:", dict(dd_kinds), "dup:", dd_dup)
print("G. grade diffs:", len(s6["sup_grade_diffs"]), "| member notfound:", len(s6["member_not_found_in_db"]), "| recent TR:", len(recent_tr))
