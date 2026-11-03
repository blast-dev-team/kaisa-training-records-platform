"""3차 검증 — 잔여 미해결 항목 정밀 추적."""
import csv
import json
import re
from collections import Counter, defaultdict

C = "/tmp/kaisa_verify/canonical"
P = "/tmp/kaisa_verify/prod"
R = "/tmp/kaisa_verify/report"

def lj(p):
    return json.load(open(p))

new = lj(f"{C}/master_new.json")
old = lj(f"{C}/master_old.json")
add0928 = lj(f"{C}/add_0928.json")

trainees = list(csv.DictReader(open(f"{P}/trainees.csv")))
records = list(csv.DictReader(open(f"{P}/records.csv")))
courses = list(csv.DictReader(open(f"{P}/courses.csv")))
sessions = list(csv.DictReader(open(f"{P}/sessions.csv")))

live = [r for r in records if not r["deleted_at"]]
deleted = [r for r in records if r["deleted_at"]]
db_rec_by_no = {r["training_record_no"]: r for r in live}
db_course_by_code = {c["course_code"]: c for c in courses if c["course_code"]}
db_tr_by_id = {t["id"]: t for t in trainees}
db_tr_by_cert = defaultdict(list)
for t in trainees:
    for k in ("cert_no", "senior_cert_no"):
        if t[k]:
            db_tr_by_cert[t[k].strip()].append(t)

out = {}

# ---- 1. ext missing 15 vs 삭제 LEG-EXT 교차 --------------------------
ext_missing = lj(f"{R}/S3_external_batches.json")["external_missing"]
xcheck = []
for e in ext_missing:
    rno = f"LEG-EXT-{e['rowno']}"
    d = db_rec_by_no.get(rno)
    ddel = next((r for r in deleted if r["training_record_no"] == rno), None)
    # 인접 rowno 성공분 (같은 사람)
    others = [r for rno2, r in db_rec_by_no.items()
              if re.match(rf"LEG-EXT-\d+$", rno2)
              and abs(int(rno2.split("-")[2]) - e["rowno"]) <= 2]
    xcheck.append({
        "rowno": e["rowno"], "name": e["name"], "cert": e["cert_no"],
        "live": bool(d), "deleted": ddel["deleted_at"][:10] if ddel else None,
        "deleted_memo": (ddel["memo"] or "")[:60] if ddel else None,
        "adjacent_records": [(o["training_record_no"],
                              (db_tr_by_id.get(o["trainee_id"]) or {}).get("name_encrypted", "?"))
                             for o in others],
    })
out["1_ext_missing_xcheck"] = xcheck

# ---- 2. OCT 3+3 정밀 -------------------------------------------------
batch_excel = lj(f"{C}/edu_1012.json")
oct_recs = [r for r in live if r["training_record_no"].startswith("LEG-EXT-OCT")]
matched_nos = set()
pairs = []
for e in batch_excel:
    hit = None
    for r in oct_recs:
        if r["training_record_no"] in matched_nos:
            continue
        t = db_tr_by_id.get(r["trainee_id"])
        if t and (t["cert_no"] or "").strip() == (e["cert_no"] or "").strip():
            hit = (r, t)
            break
    if hit:
        matched_nos.add(hit[0]["training_record_no"])
        pairs.append({"excel": f'{e["name"]}|{e["course"]}|{e["start"]}~{e["end"]}|{e["hours"]}',
                      "db": f'{(db_tr_by_id.get(hit[0]["trainee_id"]) or {}).get("name_encrypted")}|{hit[0]["course_name"]}|{hit[0]["started_at"]}~{hit[0]["ended_at"]}|{hit[0]["total_hours"]}',
                      "no": hit[0]["training_record_no"]})
unmatched_excel = [e for e in batch_excel
                   if not any(p["excel"].startswith(f'{e["name"]}|{e["course"]}') for p in pairs)]
extra_db = [r for r in oct_recs if r["training_record_no"] not in matched_nos]
out["2_oct_detail"] = {
    "unmatched_excel": [{k: e[k] for k in ("no", "name", "cert_no", "course", "start", "end", "hours")} for e in unmatched_excel],
    "extra_db": [{k: r[k] for k in ("training_record_no", "course_name", "started_at", "ended_at", "total_hours")}
                 | {"name": (db_tr_by_id.get(r["trainee_id"]) or {}).get("name_encrypted")} for r in extra_db],
    "course_mismatch_pairs": [p for p in pairs
                              if re.sub(r"\s", "", p["excel"].split("|")[1]) != re.sub(r"\s", "", p["db"].split("|")[1])],
}

# ---- 3. schdl 2083/2364 추적 ----------------------------------------
sess_by_no = defaultdict(list)
for s in sessions:
    if s["schedule_no"]:
        sess_by_no[int(float(s["schedule_no"]))].append(s)
trk = {}
for schdl in (2083, 2364):
    canon_s = [s for s in new["sessions"] if s["schdl_sn"] == schdl]
    canon_old = [s for s in old["sessions"] if s["schdl_sn"] == schdl]
    db_s = sess_by_no.get(schdl, [])
    course_names = []
    for s in canon_s:
        src = next((c for c in new["courses"] if c["sn"] == s["edc_sn"]), None)
        course_names.append(f"EDC-{s['edc_sn']}: {src['session_name']} / {src['subject']} ({src['institution']})" if src else f"EDC-{s['edc_sn']}: (canonical 과정 없음)")
    trk[schdl] = {
        "canonical_sessions": canon_s,
        "old_canonical": canon_old,
        "db_sessions": [{k: s[k] for k in ("course_id", "schedule_no", "started_at", "ended_at", "recognized_hours")} for s in db_s],
        "db_course_of_session": [db_course_by_code.get(next((c["course_code"] for c in courses if c["id"] == s["course_id"]), ""), "NO_CODE") for s in db_s],
        "canonical_course_lines": course_names,
    }
# 2083 과정 EDC-sn 이 DB에 있는가
sn_2083 = {s["edc_sn"] for s in new["sessions"] if s["schdl_sn"] == 2083}
trk["2083_db_course_exists"] = {f"EDC-{sn}": bool(db_course_by_code.get(f"EDC-{sn}")) for sn in sn_2083}
out["3_schdl_trace"] = trk

# ---- 4. OLD 기준 hours 3건 ------------------------------------------
def hours_in(data, schdl, partc):
    for e in data["enrollments"]:
        if e["schdl_sn"] == schdl and e["partc_no"] == partc:
            return e
    return None

hchk = []
for rno, schdl, partc in (("LEG-EDC-862-690", 862, 690),
                          ("LEG-EDC-860-690", 860, 690),
                          ("LEG-EDC-1081-2294", 1081, 2294)):
    o = hours_in(old, schdl, partc)
    n = hours_in(new, schdl, partc)
    hchk.append({"record_no": rno, "old": {"hours": o["hours"], "recognized": o["recognized"]} if o else None,
                 "new": {"hours": n["hours"], "recognized": n["recognized"]} if n else None,
                 "db": db_rec_by_no[rno]["total_hours"]})
out["4_hours_old_vs_new"] = hchk

# ---- 5. S6 grade diffs 66 vs A 22 차이 -------------------------------
s6 = lj(f"{R}/S6_grades.json")
gd = s6["sup_grade_diffs"]
cert_axis_bad = [d for d in gd if not d["cert_axis_ok"]]
only_grade_bad = [d for d in gd if d["cert_axis_ok"]]
out["5_grade_diffs_split"] = {
    "cert_axis_mismatch": cert_axis_bad[:50],
    "cert_axis_mismatch_count": len(cert_axis_bad),
    "grade_only_mismatch_count": len(only_grade_bad),
    "grade_only_mismatch_samples": only_grade_bad[:30],
}

# ---- 6. TR unmatched 61 ----------------------------------------------
out["6_tr_unmatched"] = a2 = lj(f"{R}/analysis2.json")["B_tr_unmatched"]

# ---- 7. member notfound 8 --------------------------------------------
out["7_member_notfound"] = lj(f"{R}/analysis2.json")["G_member_notfound"]

# ---- 8. S5 이미지/영상 상세 ------------------------------------------
s5 = lj(f"{R}/S5_image_video.json")
out["8_image_video"] = s5

# ---- 9. NEW 제거 과정/일정 DB 존재 -----------------------------------
removed_courses = lj(f"{R}/S4_courses_sessions.json")["removed_in_new_courses"]
removed_sessions = lj(f"{R}/S4_courses_sessions.json")["removed_in_new_sessions"]
out["9_removed_courses_in_db"] = [
    {**c, "db_exists": bool(db_course_by_code.get(f"EDC-{c['sn']}"))} for c in removed_courses]
old_ses_keys_db = set()
for s in sessions:
    if s["course_id"] and s["schedule_no"]:
        code = next((c["course_code"] for c in courses if c["id"] == s["course_id"]), None)
        if code:
            old_ses_keys_db.add((code, int(float(s["schedule_no"]))))
out["9_removed_sessions_in_db"] = [
    {**s, "db_exists": (f"EDC-{s['edc_sn']}", s["schdl_sn"]) in old_ses_keys_db}
    for s in removed_sessions]

# ---- 10. 백승철 부산 제22호 ------------------------------------------
bak = [r for r in records
       if any((db_tr_by_id.get(r["trainee_id"]) or {}).get("cert_no") == "부산 제22호" for r in [r])]
trk_bak = db_tr_by_cert.get("부산 제22호", [])
enr_bak = [e for e in new["enrollments"] if e["cert_no"] == "부산 제22호"]
ext_bak = [e for e in new["external"] if e["cert_no"] == "부산 제22호"]
timechk_bak = []
out["10_baek_seungchul"] = {
    "trainees_with_cert": [{k: t[k] for k in ("trainee_no", "cert_no", "supervisor_grade", "birth_date", "deleted_at")} for t in trk_bak],
    "enrollments_in_master": enr_bak,
    "external_in_master": ext_bak,
}

json.dump(out, open(f"{R}/analysis3.json", "w"), ensure_ascii=False, indent=1)
print("1. ext xcheck:", [(x["rowno"], x["live"], x["deleted"]) for x in xcheck])
print("2. oct unmatched:", len(out["2_oct_detail"]["unmatched_excel"]), "extra:", len(out["2_oct_detail"]["extra_db"]),
      "course_mismatch:", len(out["2_oct_detail"]["course_mismatch_pairs"]))
print("3. 2083:", json.dumps(out["3_schdl_trace"]["2083_db_course_exists"]))
print("4. hours:", json.dumps(out["4_hours_old_vs_new"], ensure_ascii=False))
print("5. grade split:", out["5_grade_diffs_split"]["cert_axis_mismatch_count"], "/", out["5_grade_diffs_split"]["grade_only_mismatch_count"])
print("6. TR unmatched:", len(a2))
print("8. image/video db records:", [(r["excel"]["name"], r["db_record_no"]) for r in s5["db_records"]])
print("9. removed courses in db:", [(c["sn"], c["db_exists"]) for c in out["9_removed_courses_in_db"]])
print("10. baek:", json.dumps(out["10_baek_seungchul"]["trainees_with_cert"], ensure_ascii=False), "enr:", len(enr_bak), "ext:", len(ext_bak))
