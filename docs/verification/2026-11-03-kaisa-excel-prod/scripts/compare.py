"""KAISA Excel ↔ prod DB 전수 대조 엔진.

Inputs:
- /tmp/kaisa_verify/canonical/*.json  (엑셀 canonical)
- /tmp/kaisa_verify/prod/*.csv        (prod DB dump)

Outputs:
- /tmp/kaisa_verify/report/*.json     (영역별 상세)
- console summary
"""
import csv
import json
import os
import re
from collections import Counter, defaultdict

C = "/tmp/kaisa_verify/canonical"
P = "/tmp/kaisa_verify/prod"
R = "/tmp/kaisa_verify/report"
os.makedirs(R, exist_ok=True)

report = {}


def load_json(name):
    return json.load(open(f"{C}/{name}"))


def load_csv(name):
    return list(csv.DictReader(open(f"{P}/{name}")))


new = load_json("master_new.json")
old = load_json("master_old.json")
add0928 = load_json("add_0928.json")
edu1006 = load_json("edu_1006.json")
edu1012 = load_json("edu_1012.json")
edu1013 = load_json("edu_1013.json")
mem1012 = load_json("mem_1012.json")
mem1013 = load_json("mem_1013.json")
lifetime = load_json("members_lifetime.json")
annual = load_json("members_annual.json")

trainees = load_csv("trainees.csv")
records = load_csv("records.csv")
courses = load_csv("courses.csv")
sessions = load_csv("sessions.csv")
institutions = load_csv("institutions.csv")
grades = load_csv("grades.csv")
grade_hist = load_csv("grade_hist.csv")

# ---- indices ----------------------------------------------------------
db_trainee_by_no = {t["trainee_no"]: t for t in trainees if t["trainee_no"]}
db_trainee_by_cert = defaultdict(list)
db_trainee_by_sencert = defaultdict(list)
for t in trainees:
    if t["cert_no"]:
        db_trainee_by_cert[t["cert_no"].strip()].append(t)
    if t["senior_cert_no"]:
        db_trainee_by_sencert[t["senior_cert_no"].strip()].append(t)

live_records = [r for r in records if not r["deleted_at"]]
db_record_by_no = {r["training_record_no"]: r for r in live_records}
db_course_by_code = {c["course_code"]: c for c in courses if c["course_code"]}
inst_name_by_id = {i["id"]: i["name"] for i in institutions}
grade_name_by_id = {g["id"]: g["name"] for g in grades}

# canonical session index: schdl_sn → session (first wins, mirrors import)
canon_session_by_no = {}
for s in new["sessions"]:
    canon_session_by_no.setdefault(s["schdl_sn"], s)


def same_date(a, b):
    a = (a or "")[:10]
    b = (b or "")[:10]
    if not a and not b:
        return True
    return a == b


# ======================================================================
# S1. 감리원 목록 (NEW 감리원추가 vs trainees)
# ======================================================================
old_nos = {s["no"] for s in old["supervisors"]}
new_sup_by_no = {s["no"]: s for s in new["supervisors"]}
sup_missing = []      # canonical valid → DB 없음
sup_field_diff = []   # 있으나 필드 불일치
sup_ok = 0
for no, s in sorted(new_sup_by_no.items()):
    t = db_trainee_by_no.get(f"EDU-{no}")
    if t is None:
        sup_missing.append({"no": no, **s})
        continue
    diffs = {}
    if (s["cert_no"] or "") != (t["cert_no"] or ""):
        # B방식: 수석감리원은 senior_cert_no 쪽에 번호
        if t["senior_cert_no"] != s["cert_no"]:
            diffs["cert_no"] = {"excel": s["cert_no"], "db_cert": t["cert_no"],
                                "db_senior": t["senior_cert_no"]}
    if (s["grade"] or "") != (t["supervisor_grade"] or ""):
        diffs["grade"] = {"excel": s["grade"], "db": t["supervisor_grade"]}
    if not same_date(s["birth"], t["birth_date"]):
        diffs["birth"] = {"excel": s["birth"], "db": t["birth_date"]}
    if diffs:
        sup_field_diff.append({"no": no, "name": s["name"], **diffs})
    else:
        sup_ok += 1

new_only_sup = [s for s in new["supervisors"] if s["no"] not in old_nos]
new_only_in_db = [s for s in new_only_sup if f"EDU-{s['no']}" in db_trainee_by_no]
new_only_missing = [s for s in new_only_sup if f"EDU-{s['no']}" not in db_trainee_by_no]

# TR-* 교육생 매칭
tr_trainees = [t for t in trainees if (t["trainee_no"] or "").startswith("TR-")]
all_excel_certs = set()
for src in (new["supervisors"], add0928, mem1012, mem1013, lifetime, annual):
    for s in src:
        if s.get("cert_no"):
            all_excel_certs.add(s["cert_no"].strip())
tr_unmatched = [t for t in tr_trainees
                if (t["cert_no"] or "").strip() not in all_excel_certs]
tr_matched = len(tr_trainees) - len(tr_unmatched)

# 삭제 교육생
deleted_trainees = [t for t in trainees if t["deleted_at"]]

report["S1_supervisors"] = {
    "canonical_total": len(new["supervisors"]),
    "matched_ok": sup_ok,
    "missing_in_db": sup_missing,
    "field_diffs": sup_field_diff,
    "new_vs_old_added": len(new_only_sup),
    "new_added_in_db": len(new_only_in_db),
    "new_added_missing_in_db": new_only_missing,
    "tr_trainees_total": len(tr_trainees),
    "tr_matched_to_excel_cert": tr_matched,
    "tr_unmatched": [{k: t[k] for k in ("trainee_no", "cert_no", "senior_cert_no",
                                        "supervisor_grade", "birth_date", "created_at",
                                        "name_encrypted")}
                     for t in tr_unmatched],
    "deleted_trainees": len(deleted_trainees),
}

# ======================================================================
# S2. 수강신청 교육내역 (LEG-EDC)
# ======================================================================
valid_enr = [e for e in new["enrollments"]
             if e["schdl_sn"] is not None and e["partc_no"] is not None]
na_enr = [e for e in new["enrollments"]
          if e["schdl_sn"] is None or e["partc_no"] is None]
enr_missing = []
enr_diff = []
enr_ok = 0
seen_keys = set()
for e in valid_enr:
    key = (e["schdl_sn"], e["partc_no"])
    rno = f"LEG-EDC-{key[0]}-{key[1]}"
    r = db_record_by_no.get(rno)
    if r is None:
        if key not in seen_keys:
            enr_missing.append(e)
        seen_keys.add(key)
        continue
    diffs = {}
    canon_rec = canon_session_by_no.get(e["schdl_sn"])
    # import: hours = 인정시간(row[4])
    if abs(float(r["total_hours"] or 0) - e["recognized"]) > 0.01 and abs(
            float(r["total_hours"] or 0) - e["hours"]) > 0.01:
        diffs["hours"] = {"excel_recognized": e["recognized"], "excel_hours": e["hours"],
                          "db": r["total_hours"]}
    if not same_date(canon_rec["start"] if canon_rec else None, r["started_at"]):
        diffs["start"] = {"excel": canon_rec["start"] if canon_rec else None,
                          "db": r["started_at"]}
    if not same_date(canon_rec["end"] if canon_rec else None, r["ended_at"]):
        diffs["end"] = {"excel": canon_rec["end"] if canon_rec else None,
                        "db": r["ended_at"]}
    if diffs:
        enr_diff.append({"record_no": rno, "name": e["name"], "cert": e["cert_no"],
                         **{k: v for k, v in diffs.items()}})
    else:
        enr_ok += 1

# DB LEG-EDC 중 canonical에 없는 것
canon_keys = {(e["schdl_sn"], e["partc_no"]) for e in valid_enr}
db_extra_edc = []
for rno, r in db_record_by_no.items():
    m = re.match(r"LEG-EDC-(\d+)-(\d+)$", rno)
    if m and (int(m.group(1)), int(m.group(2))) not in canon_keys:
        db_extra_edc.append(rno)

# 신구 diff: NEW에만 있는 수강신청
old_enr_keys = {(e["schdl_sn"], e["partc_no"]) for e in old["enrollments"]
                if e["schdl_sn"] is not None and e["partc_no"] is not None}
new_enr_only = [e for e in valid_enr
                if (e["schdl_sn"], e["partc_no"]) not in old_enr_keys]
new_enr_only_in_db = [e for e in new_enr_only
                      if f"LEG-EDC-{e['schdl_sn']}-{e['partc_no']}" in db_record_by_no]

report["S2_legacy_edc"] = {
    "canonical_valid": len(valid_enr),
    "canonical_na_skipped": len(na_enr),
    "matched_ok": enr_ok,
    "missing_in_db": enr_missing,
    "field_diffs": enr_diff,
    "db_extra_not_in_canonical": db_extra_edc,
    "new_only_count": len(new_enr_only),
    "new_only_in_db": len(new_enr_only_in_db),
    "new_only_missing": new_enr_only,
}

# ======================================================================
# S3. 외부교육 + 요청건 배치
# ======================================================================
ext_missing, ext_diff, ext_ok = [], [], 0
for e in new["external"]:
    rno = f"LEG-EXT-{e['rowno']}"
    r = db_record_by_no.get(rno)
    if r is None:
        ext_missing.append(e)
        continue
    diffs = {}
    if abs(float(r["total_hours"] or 0) - e["recognized"]) > 0.01 and abs(
            float(r["total_hours"] or 0) - e["hours"]) > 0.01:
        diffs["hours"] = {"excel": (e["recognized"], e["hours"]), "db": r["total_hours"]}
    if not same_date(e["start"], r["started_at"]):
        diffs["start"] = {"excel": e["start"], "db": r["started_at"]}
    if not same_date(e["end"], r["ended_at"]):
        diffs["end"] = {"excel": e["end"], "db": r["ended_at"]}
    if diffs:
        ext_diff.append({"record_no": rno, "name": e["name"], "inst": e["institution"],
                         **diffs})
    else:
        ext_ok += 1


def match_batch(batch, label, records_subset):
    """요청건 배치: 엑셀 행 ↔ DB 레코드 최유사 매칭 (이름+증번호+과정+날짜+시간)."""
    unmatched_excel = []
    matched_pairs = []
    db_pool = list(records_subset)
    for e in batch:
        best, best_score = None, 0
        for r in db_pool:
            score = 0
            t = db_trainee_by_no.get(r["trainee_id"])  # not keyed — use id map below
            score += 1  # placeholder replaced below
            best = r
            break
        # 실제 매칭은 아래 key 기반으로 한다
        matched_pairs.append((e, best))
    return unmatched_excel, matched_pairs


# trainee id → trainee
db_trainee_by_id = {t["id"]: t for t in trainees}

def norm_txt(s):
    return re.sub(r"\s+", "", s or "")


def batch_match(batch, pool):
    """엑셀 행별로 pool 에서 이름(cert→trainee name)+과정+날짜+시간 유사 매칭. 1:1 소진."""
    result = []
    used = set()
    for e in batch:
        cands = []
        for i, r in enumerate(pool):
            if i in used:
                continue
            t = db_trainee_by_id.get(r["trainee_id"])
            score = 0
            if t and e.get("cert_no") and t["cert_no"] == e["cert_no"]:
                score += 10
            if norm_txt(r["course_name"]) == norm_txt(e.get("course") or ""):
                score += 5
            elif norm_txt(e.get("course") or "") and norm_txt(e.get("course")) in norm_txt(r["course_name"]):
                score += 3
            if same_date(e.get("start"), r["started_at"]):
                score += 3
            if same_date(e.get("end"), r["ended_at"]):
                score += 3
            if e.get("hours") and abs(float(r["total_hours"] or 0) - e["hours"]) < 0.01:
                score += 2
            if score >= 10:
                cands.append((score, i, r))
        if cands:
            cands.sort(reverse=True)
            used.add(cands[0][1])
            result.append({"excel": e, "db": cands[0][2], "score": cands[0][0]})
        else:
            result.append({"excel": e, "db": None})
    return result


batch_add = batch_match(edu1006, [r for r in live_records
                                  if r["training_record_no"].startswith("LEG-EXT-ADD-")])
batch_oct12 = batch_match(edu1012, [r for r in live_records
                                    if r["training_record_no"].startswith("LEG-EXT-OCT")])
batch_1013 = batch_match(edu1013, [r for r in live_records
                                   if r["training_record_no"].startswith("REC-20261103-")])

# OCT/ADD/REC 미소진 DB 레코드 (엑셀에 없는 DB 레코드)
used_oct = {r["training_record_no"] for m in batch_oct12 if (r := m["db"])}
used_add = {r["training_record_no"] for m in batch_add if (r := m["db"])}
used_1013 = {r["training_record_no"] for m in batch_1013 if (r := m["db"])}
extra_oct = [r["training_record_no"] for r in live_records
             if r["training_record_no"].startswith("LEG-EXT-OCT") and r["training_record_no"] not in used_oct]
extra_add = [r["training_record_no"] for r in live_records
             if r["training_record_no"].startswith("LEG-EXT-ADD-") and r["training_record_no"] not in used_add]
extra_1013 = [r["training_record_no"] for r in live_records
              if r["training_record_no"].startswith("REC-20261103-") and r["training_record_no"] not in used_1013]

# 0928/0930 기타 수동 배치
manual_recs = [r for r in live_records
               if r["training_record_no"].startswith("REC-202609")
               or (r["training_record_no"].startswith("REC-202610")
                   and not r["training_record_no"].startswith("REC-20261103-"))]

report["S3_external_batches"] = {
    "external_canonical": len(new["external"]),
    "external_ok": ext_ok,
    "external_missing": ext_missing,
    "external_diffs": ext_diff,
    "batch_1006_add": {"excel": len(edu1006), "matches": len(used_add),
                       "unmatched": [{"excel": m["excel"], "db": None} for m in batch_add if not m["db"]],
                       "field_mismatch": [{"excel": m["excel"], "db": {k: m["db"][k] for k in ("training_record_no", "course_name", "started_at", "ended_at", "total_hours")}}
                                          for m in batch_add if m["db"] and (
                                              not same_date(m["excel"]["start"], m["db"]["started_at"])
                                              or not same_date(m["excel"]["end"], m["db"]["ended_at"])
                                              or abs(float(m["db"]["total_hours"] or 0) - m["excel"]["hours"]) > 0.01)],
                       "db_extra": extra_add},
    "batch_1012_oct": {"excel": len(edu1012), "matches": len(used_oct),
                       "unmatched": [{"excel": m["excel"]} for m in batch_oct12 if not m["db"]],
                       "field_mismatch": [{"excel": m["excel"], "db": {k: m["db"][k] for k in ("training_record_no", "course_name", "started_at", "ended_at", "total_hours")}}
                                          for m in batch_oct12 if m["db"] and (
                                              not same_date(m["excel"]["start"], m["db"]["started_at"])
                                              or not same_date(m["excel"]["end"], m["db"]["ended_at"])
                                              or abs(float(m["db"]["total_hours"] or 0) - m["excel"]["hours"]) > 0.01)],
                       "db_extra": extra_oct},
    "batch_1013_today": {"excel": len(edu1013), "matches": len(used_1013),
                         "unmatched": [{"excel": m["excel"]} for m in batch_1013 if not m["db"]],
                         "field_mismatch": [{"excel": m["excel"], "db": {k: m["db"][k] for k in ("training_record_no", "course_name", "started_at", "ended_at", "total_hours")}}
                                            for m in batch_1013 if m["db"] and (
                                                not same_date(m["excel"]["start"], m["db"]["started_at"])
                                                or not same_date(m["excel"]["end"], m["db"]["ended_at"])
                                                or abs(float(m["db"]["total_hours"] or 0) - m["excel"]["hours"]) > 0.01)],
                         "db_extra": extra_1013},
    "manual_rec_0910_batches": [{k: r[k] for k in ("training_record_no", "course_name",
                                                   "institution_name", "started_at",
                                                   "ended_at", "total_hours", "created_at")}
                                for r in manual_recs],
}

# ======================================================================
# S4. 과정/일정 (마스터) + 날짜별 대조
# ======================================================================
course_missing, course_diff, course_ok = [], [], 0
for c in new["courses"]:
    code = f"EDC-{c['sn']}"
    db = db_course_by_code.get(code)
    if db is None:
        course_missing.append(c)
        continue
    diffs = {}
    if norm_txt(c["subject"]) not in norm_txt(db["name"]):
        diffs["name"] = {"excel": f"{c['session_name']} {c['subject']}", "db": db["name"]}
    if c["institution"] and inst_name_by_id.get(db["institution_id"]) != c["institution"]:
        diffs["institution"] = {"excel": c["institution"],
                                "db": inst_name_by_id.get(db["institution_id"])}
    if diffs:
        course_diff.append({"code": code, **diffs})
    else:
        course_ok += 1

session_missing, session_date_diff, session_ok = [], [], 0
db_sessions_by_key = set()
for s in sessions:
    if s["course_id"] and s["schedule_no"]:
        db_sessions_by_key.add((s["course_id"], int(float(s["schedule_no"]))))
for s in new["sessions"]:
    course = db_course_by_code.get(f"EDC-{s['edc_sn']}")
    if course is None or (course["id"], s["schdl_sn"]) not in db_sessions_by_key:
        session_missing.append(s)
        continue
    # 해당 (course, schedule_no) 일정 찾아 날짜 대조
    db_s = next((x for x in sessions if x["course_id"] == course["id"]
                 and x["schedule_no"] and abs(float(x["schedule_no"]) - s["schdl_sn"]) < 0.5), None)
    diffs = {}
    if db_s:
        if not same_date(s["start"], db_s["started_at"]):
            diffs["start"] = {"excel": s["start"], "db": db_s["started_at"]}
        if not same_date(s["end"], db_s["ended_at"]):
            diffs["end"] = {"excel": s["end"], "db": db_s["ended_at"]}
    if diffs:
        session_date_diff.append({"edc_sn": s["edc_sn"], "schdl_sn": s["schdl_sn"],
                                  "subject": s["subject"], **diffs})
    else:
        session_ok += 1

# 신구 diff: NEW에서 제거된 과정/일정
old_course_sns = {c["sn"] for c in old["courses"]}
removed_courses = [c for c in old["courses"] if c["sn"] not in {x["sn"] for x in new["courses"]}]
old_ses_keys = {(s["edc_sn"], s["schdl_sn"]) for s in old["sessions"]}
removed_sessions = [s for s in old["sessions"]
                    if (s["edc_sn"], s["schdl_sn"]) not in {(x["edc_sn"], x["schdl_sn"]) for x in new["sessions"]}]

report["S4_courses_sessions"] = {
    "courses_canonical": len(new["courses"]), "courses_ok": course_ok,
    "courses_missing": course_missing, "courses_diff": course_diff,
    "sessions_canonical": len(new["sessions"]), "sessions_ok": session_ok,
    "sessions_missing_in_db": session_missing,
    "session_date_diffs": session_date_diff,
    "removed_in_new_courses": removed_courses,
    "removed_in_new_sessions": removed_sessions,
}

# ======================================================================
# S5. 이미지 / 영상 입문 과정
# ======================================================================
target_course = [c for c in new["courses"] if "입문" in (c["subject"] or "")
                 and "이미지" in (c["subject"] or "")]
db_target_courses = [c for c in courses if "입문" in c["name"] and "이미지" in c["name"]]
target_sns = {c["sn"] for c in target_course}
target_sessions = [s for s in new["sessions"] if s["edc_sn"] in target_sns]
target_enroll = [e for e in new["enrollments"] if "이미지 / 영상 입문" in (e["subject"] or "")]
target_db_records = []
for e in target_enroll:
    if e["schdl_sn"] is None or e["partc_no"] is None:
        continue
    rno = f"LEG-EDC-{e['schdl_sn']}-{e['partc_no']}"
    r = db_record_by_no.get(rno)
    target_db_records.append({"excel": e, "db_record_no": rno if r else None,
                              "db_start": r["started_at"] if r else None,
                              "db_end": r["ended_at"] if r else None,
                              "db_hours": r["total_hours"] if r else None})
# 시간확인용의 해당 과정 행
wb_hits_timecheck = load_json("master_new.json")  # 시간확인용은 별도 추출 안 함 — 아래에서 처리

report["S5_image_video"] = {
    "canonical_courses": target_course,
    "db_courses": [{k: c[k] for k in ("course_code", "name", "institution_id", "category", "total_hours")}
                   for c in db_target_courses],
    "canonical_sessions": target_sessions,
    "canonical_enrollments": len(target_enroll),
    "db_records": target_db_records,
}

# ======================================================================
# S6. 등급 (감리원등급 + 회원등급)
# ======================================================================
grade_diff = []
grade_ok = 0
for s in new["supervisors"]:
    t = db_trainee_by_no.get(f"EDU-{s['no']}")
    if t is None:
        continue
    # B방식 검증: DB 번호 축과 엑셀 번호 일치 여부
    excel_cert = s["cert_no"] or ""
    db_has = (t["cert_no"] or "").strip() == excel_cert or (t["senior_cert_no"] or "").strip() == excel_cert
    db_grade_ok = (t["supervisor_grade"] or "") == (s["grade"] or "")
    if db_has and db_grade_ok:
        grade_ok += 1
    else:
        grade_diff.append({"no": s["no"], "name": s["name"], "excel_grade": s["grade"],
                           "excel_cert": s["cert_no"], "db_grade": t["supervisor_grade"],
                           "db_cert": t["cert_no"], "db_senior": t["senior_cert_no"],
                           "cert_axis_ok": db_has})

# 회원등급 (평생/연간) — DB 적용 상태
lifetime_in_db = 0
annual_in_db = 0
member_notfound = []
member_grade_sample = []
for m in lifetime:
    cands = db_trainee_by_cert.get((m["cert_no"] or "").strip()) or db_trainee_by_sencert.get((m["cert_no"] or "").strip())
    if not cands:
        member_notfound.append(m)
        continue
    t = cands[0]
    if t["membership_grade_id"]:
        lifetime_in_db += 1
for m in annual:
    cands = db_trainee_by_cert.get((m["cert_no"] or "").strip()) or db_trainee_by_sencert.get((m["cert_no"] or "").strip())
    if not cands:
        member_notfound.append(m)
        continue
    t = cands[0]
    if t["membership_grade_id"]:
        annual_in_db += 1

db_grade_members = [t for t in trainees if t["membership_grade_id"]]
report["S6_grades"] = {
    "sup_grade_ok": grade_ok,
    "sup_grade_diffs": grade_diff,
    "membership_grades_master": grades,
    "member_grade_histories": len(grade_hist),
    "trainees_with_membership_grade": len(db_grade_members),
    "lifetime_sheet": len(lifetime), "lifetime_with_grade_in_db": lifetime_in_db,
    "annual_sheet": len(annual), "annual_with_grade_in_db": annual_in_db,
    "member_not_found_in_db": member_notfound,
    "grade_hist_detail": grade_hist,
}

# ======================================================================
# S7. 삭제 레코드 검증
# ======================================================================
deleted = [r for r in records if r["deleted_at"]]
report["S7_deleted"] = {
    "total": len(deleted),
    "by_source": dict(Counter(r["source"] for r in deleted)),
    "by_date": dict(Counter(r["deleted_at"][:10] for r in deleted)),
    "no_memo": [{"record_no": r["training_record_no"], "memo": r["memo"],
                 "deleted_at": r["deleted_at"]} for r in deleted
                if not (r["memo"] or "").strip() or (r["memo"] or "").strip() == "123"],
}

# ======================================================================
# summary
# ======================================================================
for k, v in report.items():
    json.dump(v, open(f"{R}/{k}.json", "w"), ensure_ascii=False, indent=1)

print("=== SUMMARY ===")
s1 = report["S1_supervisors"]
print(f"S1 감리원: canonical {s1['canonical_total']} / OK {s1['matched_ok']} / DB누락 {len(s1['missing_in_db'])} / 필드불일치 {len(s1['field_diffs'])}")
print(f"   NEW신규(+NEW only): {s1['new_vs_old_added']} → DB반영 {s1['new_added_in_db']} / 미반영 {s1['new_added_missing_in_db']}")
print(f"   TR-* 교육생 {s1['tr_trainees_total']} (엑셀매칭 {s1['tr_matched_to_excel_cert']} / 미매칭 {len(s1['tr_unmatched'])}) / 삭제교육생 {s1['deleted_trainees']}")
s2 = report["S2_legacy_edc"]
print(f"S2 수강신청: canonical {s2['canonical_valid']} / OK {s2['matched_ok']} / DB누락 {len(s2['missing_in_db'])} / 필드불일치 {len(s2['field_diffs'])} / DB초과 {len(s2['db_extra_not_in_canonical'])}")
print(f"   NEW신규 수강신청: {s2['new_only_count']} → DB반영 {s2['new_only_in_db']} / 미반영 {s2['new_only_missing'] and len(s2['new_only_missing'])}")
s3 = report["S3_external_batches"]
print(f"S3 외부교육: canonical {s3['external_canonical']} / OK {s3['external_ok']} / DB누락 {len(s3['external_missing'])} / 필드불일치 {len(s3['external_diffs'])}")
print(f"   ADD(10.06): excel {s3['batch_1006_add']['excel']} match {s3['batch_1006_add']['matches']} mismatch {len(s3['batch_1006_add']['field_mismatch'])} extra {len(s3['batch_1006_add']['db_extra'])}")
print(f"   OCT(10.12): excel {s3['batch_1012_oct']['excel']} match {s3['batch_1012_oct']['matches']} mismatch {len(s3['batch_1012_oct']['field_mismatch'])} extra {len(s3['batch_1012_oct']['db_extra'])}")
print(f"   1013(금일): excel {s3['batch_1013_today']['excel']} match {s3['batch_1013_today']['matches']} mismatch {len(s3['batch_1013_today']['field_mismatch'])} extra {len(s3['batch_1013_today']['db_extra'])}")
s4 = report["S4_courses_sessions"]
print(f"S4 과정: canonical {s4['courses_canonical']} / OK {s4['courses_ok']} / DB누락 {len(s4['courses_missing'])} / 불일치 {len(s4['courses_diff'])}")
print(f"   일정: canonical {s4['sessions_canonical']} / OK {s4['sessions_ok']} / DB누락 {len(s4['sessions_missing_in_db'])} / 날짜불일치 {len(s4['session_date_diffs'])}")
print(f"   NEW제거: 과정 {len(s4['removed_in_new_courses'])} / 일정 {len(s4['removed_in_new_sessions'])}")
s5 = report["S5_image_video"]
print(f"S5 이미지/영상: canonical courses {len(s5['canonical_courses'])} / db courses {len(s5['db_courses'])} / enrollments {s5['canonical_enrollments']} / db records {len([r for r in s5['db_records'] if r['db_record_no']])}/{len(s5['db_records'])}")
s6 = report["S6_grades"]
print(f"S6 감리원등급: OK {s6['sup_grade_ok']} / 불일치 {len(s6['sup_grade_diffs'])}")
print(f"   회원등급: 부여 trainee {s6['trainees_with_membership_grade']} (평생 {s6['lifetime_with_grade_in_db']}/{s6['lifetime_sheet']} · 연간 {s6['annual_with_grade_in_db']}/{s6['annual_sheet']}) / 명부미매칭 {len(s6['member_not_found_in_db'])} / 이력 {s6['member_grade_histories']}")
s7 = report["S7_deleted"]
print(f"S7 삭제: {s7['total']} {s7['by_source']} {s7['by_date']} / memo누락 {len(s7['no_memo'])}")
