"""4차 — 최종 잔여 항목 확정."""
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

trainees = list(csv.DictReader(open(f"{P}/trainees.csv")))
records = list(csv.DictReader(open(f"{P}/records.csv")))
live = [r for r in records if not r["deleted_at"]]
db_rec_by_no = {r["training_record_no"]: r for r in live}
db_tr_by_id = {t["id"]: t for t in trainees}
db_tr_by_cert = defaultdict(list)
for t in trainees:
    for k in ("cert_no", "senior_cert_no"):
        if t[k]:
            db_tr_by_cert[t[k].strip()].append(t)

out = {}

# ---- a. schdl 2083 26명 + PMO 2명의 감리원추가 NO 존재 여부 ----------
sup_nos = {s["no"] for s in new["supervisors"]}
sup_nos_old = {s["no"] for s in old["supervisors"]}
targets = [
    ("개발보안", [("안영근", 4698), ("백승원", 6126), ("유진영", 5616), ("권혁천", 4996),
               ("김성경", 3678), ("김욱환", 1588), ("김제유", 5278), ("김주홍", 5797),
               ("남재근", 2279), ("박경용", 4037), ("박명수", 4434), ("박용진", 2168),
               ("박을용", 3389), ("신태갑", 5303), ("원종빈", 3809), ("이동욱", 6324),
               ("전재영", 3280), ("정은주", 3019), ("정하영", 4912), ("정현욱", 564),
               ("조민진", 6535), ("최원영", 2464), ("한경훈", 4857), ("홍기선", 3330),
               ("홍대기", 3458), ("황선환", 6284)]),
    ("PMO", [("김미령", 3203), ("황동환", 6002)]),
]
res = {}
for label, people in targets:
    rows = []
    for name, partc in people:
        in_new = partc in sup_nos
        in_old = partc in sup_nos_old
        tr = db_tr_by_cert.get(name)  # 이름 아님 — cert 키 아님. NO로 EDU 확인
        edu = db_tr_by_id  # placeholder
        rows.append({"name": name, "partc": partc, "in_new_sup": in_new, "in_old_sup": in_old,
                     "edu_no": f"EDU-{partc}" if in_new else None})
    res[label] = rows
out["a_2083_no_presence"] = res
# partc NO가 new 감리원추가에 있으면 EDU-{no} trainee 존재 여부
db_tr_by_no = {t["trainee_no"]: t for t in trainees}
for label in res:
    for r in res[label]:
        if r["in_new_sup"]:
            t = db_tr_by_no.get(f"EDU-{r['partc']}")
            r["edu_in_db"] = bool(t)
            r["db_cert"] = t["cert_no"] if t else None

# ---- b. OCT12 전체 name+course+date+hours 세트 매칭 ------------------
edu1012 = lj(f"{C}/edu_1012.json")
oct_recs = [r for r in live if r["training_record_no"].startswith("LEG-EXT-OCT")]
db_sigs = Counter()
for r in oct_recs:
    n = (db_tr_by_id.get(r["trainee_id"]) or {}).get("name_encrypted") or "?"
    db_sigs[(n, re.sub(r"\s+", "", r["course_name"]), r["started_at"] or "", r["ended_at"] or "",
             str(float(r["total_hours"] or 0)))] += 1
excel_sigs = Counter()
for e in edu1012:
    excel_sigs[(e["name"], re.sub(r"\s+", "", e["course"]), e["start"] or "", e["end"] or "",
                str(float(e["hours"] or 0)))] += 1
only_excel = excel_sigs - db_sigs
only_db = db_sigs - excel_sigs
out["b_oct_set_diff"] = {
    "excel_rows": len(edu1012), "db_rows": len(oct_recs),
    "only_in_excel": [dict(zip(("name", "course", "start", "end", "hours"), k)) | {"n": v} for k, v in only_excel.items()],
    "only_in_db": [dict(zip(("name", "course", "start", "end", "hours"), k)) | {"n": v} for k, v in only_db.items()],
}

# ---- c. member notfound 8 재매칭 (이름+생년) --------------------------
notfound = lj(f"{R}/analysis2.json")["G_member_notfound"]
import unicodedata
def norm_name(v):
    return unicodedata.normalize("NFKC", (v or "")).strip()
name_by = defaultdict(list)
for t in trainees:
    if t["name_encrypted"]:
        name_by[norm_name(t["name_encrypted"])].append(t)
rematch = []
for m in notfound:
    cands = name_by.get(m["name"], [])
    rematch.append({
        "name": m["name"], "sheet_cert": m["cert_no"], "grade": m["member_grade"],
        "birth": m["birth"],
        "db_candidates": [{k: t[k] for k in ("trainee_no", "cert_no", "senior_cert_no",
                                             "supervisor_grade", "birth_date",
                                             "membership_grade_id", "grade_expires_at")}
                          for t in cands],
    })
out["c_member_rematch"] = rematch

# ---- d. S2 300 fallback 정상 확인 ------------------------------------
s2 = lj(f"{R}/S2_legacy_edc.json")
fb = [d for d in s2["field_diffs"] if "start" in d or "end" in d]
ok, bad = 0, []
for d in fb:
    r = db_rec_by_no.get(d["record_no"])
    if r and r["course_id"] and r["session_id"]:
        ok += 1
    else:
        bad.append({"record_no": d["record_no"], "course_id": bool(r and r["course_id"]),
                    "session_id": bool(r and r["session_id"])})
out["d_fallback_records"] = {"total": len(fb), "course_session_linked": ok, "unlinked": bad[:20]}

# ---- e. S5 이미지/영상 상세 ------------------------------------------
s5 = lj(f"{R}/S5_image_video.json")
out["e_image_video_detail"] = s5

# ---- f. TR unmatched 61 ----------------------------------------------
out["f_tr_unmatched"] = lj(f"{R}/analysis2.json")["B_tr_unmatched"]

# ---- g. 193번 member -------------------------------------------------
wb_notfound = lj(f"{R}/analysis2.json")["G_member_notfound"]
out["g_last_member"] = wb_notfound[-1] if len(wb_notfound) > 7 else None

json.dump(out, open(f"{R}/analysis4.json", "w"), ensure_ascii=False, indent=1)
print("a. 2083 NO 존재:", [(r["name"], r["in_new_sup"], r.get("edu_in_db")) for r in res["개발보안"]][:10], "…")
print("   PMO:", [(r["name"], r["in_new_sup"], r.get("edu_in_db")) for r in res["PMO"]])
print("b. OCT set diff: excel_only", len(only_excel), "db_only", len(only_db))
for k, v in only_excel.items(): print("   E:", k, v)
for k, v in only_db.items(): print("   D:", k, v)
print("d. fallback:", out["d_fallback_records"]["total"], "linked", ok, "unlinked", len(bad))
print("g:", out["g_last_member"])
