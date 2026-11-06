"""전수 — 수강신청 행의 과목명 vs DB 등록 과정명 불일치 전수 추출.

불일치 판정: DB course_name에 행의 과목명(또는 회차명)이 정규화 포함되지 않는 경우.
원인은 대부분 SCHDL_SN 충돌 — 수강신청 행이 다른 과정의 회차번호를 참조해
임포트가 세션(상세 시트) 쪽 과정으로 등록한 것.
"""
import csv
import json
import re
from collections import Counter, defaultdict

import openpyxl

C = "/tmp/kaisa_verify/canonical"
P = "/tmp/kaisa_verify/prod"
OUT_X = "/Users/choegilang/Desktop/dev/kaisa-training-records-platform/docs/verification/2026-11-03-kaisa-excel-prod/과정불일치-전수-2026-11-04.xlsx"

new = json.load(open(f"{C}/master_new.json"))
new_course_by_sn = {c["sn"]: c for c in new["courses"]}

# canonical: 수강신청 (schdl, partc) → 행
enr_by_key = {}
for e in new["enrollments"]:
    if e["schdl_sn"] is not None and e["partc_no"] is not None:
        enr_by_key.setdefault((e["schdl_sn"], e["partc_no"]), e)
# canonical: schdl → 상세 세션 (회차가 속한 과정)
ses_by_no = {}
for s in new["sessions"]:
    ses_by_no.setdefault(s["schdl_sn"], s)

def norm(s):
    return re.sub(r"\s+", "", s or "")

trainees = list(csv.DictReader(open(f"{P}/trainees.csv")))
records = list(csv.DictReader(open(f"{P}/records.csv")))
tr_by_id = {t["id"]: t for t in trainees}

mismatches = []
matched = 0
no_enr = 0
for r in records:
    if r["deleted_at"] or not r["training_record_no"].startswith("LEG-EDC-"):
        continue
    m = re.match(r"LEG-EDC-(\d+)-(\d+)$", r["training_record_no"])
    key = (int(m.group(1)), int(m.group(2)))
    e = enr_by_key.get(key)
    if e is None:
        no_enr += 1  # 마스터(NEW)에 없는 행 — 제거·변경분
        continue
    t = tr_by_id.get(r["trainee_id"], {})
    dbn = norm(r["course_name"])
    subj = norm(e["subject"] or "")
    sess = norm(e["session_name"] or "")
    ok = (subj and (subj in dbn or dbn in subj)) or (sess and (sess in dbn or dbn in sess))
    if ok:
        matched += 1
        continue
    ses = ses_by_no.get(key[0])
    src_course = new_course_by_sn.get(ses["edc_sn"]) if ses else None
    mismatches.append({
        "record_no": r["training_record_no"],
        "이름": (tr_by_id.get(r["trainee_id"]) or {}).get("name_encrypted"),
        "증번호": (tr_by_id.get(r["trainee_id"]) or {}).get("cert_no"),
        "schdl": key[0], "partc": key[1],
        "행과목명": e["subject"], "행회차명": e["session_name"],
        "행시간": e["recognized"],
        "DB과정명": r["course_name"], "DB기관": r["institution_name"][:25],
        "DB시간": r["total_hours"],
        "DB기간": f'{r["started_at"] or "NULL"}~{r["ended_at"] or "NULL"}',
        "상세회차과정": f'{(src_course or {}).get("session_name", "")} / {(src_course or {}).get("subject", "")}',
        "상세기관": (src_course or {}).get("institution") or "",
        "상세기간": f'{ses.get("start") if ses else "?"}~{ses.get("end") if ses else "?"}',
    })

by_schdl = defaultdict(lambda: {"n": 0, "persons": set(), "subjects": set(),
                                "db_courses": set(), "session_course": "", "dates": ""})
for x in mismatches:
    a = by_schdl[x["schdl"]]
    a["n"] += 1
    a["persons"].add(x["이름"])
    a["subjects"].add(x["행과목명"])
    a["db_courses"].add(x["DB과정명"])
    a["session_course"] = x["상세회차과정"]
    a["dates"] = x["상세기간"]

json.dump({"mismatches": mismatches,
           "by_schdl": {str(k): {**v, "persons": sorted(v["persons"]), "subjects": sorted(v["subjects"]),
                                 "db_courses": sorted(v["db_courses"])}
                        for k, v in by_schdl.items()},
           "matched": matched, "no_enr": no_enr, "total": len(mismatches)},
          open("/tmp/kaisa_verify/report/course_mismatch_scan.json", "w"), ensure_ascii=False, indent=1)

wb = openpyxl.Workbook()
wb.remove(wb.active)
ws = wb.create_sheet("회차별요약")
ws.append(["SCHDL_SN", "불일치행수", "인원수", "수강신청 행 과목명", "DB에 등록된 과정명",
           "상세 시트가 정의한 과정", "상세 기간"])
for k, a in sorted(by_schdl.items(), key=lambda x: -x[1]["n"]):
    ws.append([k, a["n"], len(a["persons"]), " / ".join(a["subjects"])[:120],
               " / ".join(a["db_courses"])[:120], a["session_course"], a["dates"]])
ws2 = wb.create_sheet("레코드전체")
ws2.append(["record_no", "이름", "증번호", "schdl", "행과목명", "행회차명", "행시간",
            "DB과정명", "DB기관", "DB시간", "DB기간", "상세회차과정", "상세기관", "상세기간"])
for x in mismatches:
    ws2.append([x[k] for k in ("record_no", "이름", "증번호", "schdl", "행과목명", "행회차명",
                               "행시간", "DB과정명", "DB기관", "DB시간", "DB기간",
                               "상세회차과정", "상세기관", "상세기간")])
wb.save(OUT_X)

print(f"live LEG-EDC 대상 중: 일치 {matched} / 마스터에 없는 행 {no_enr} / 불일치 {len(mismatches)}")
print(f"충돌 schdl 종수: {len(by_schdl)} | 영향 인원: {len({x['이름'] for x in mismatches})}명")
print()
print("=== schdl별 요약 (상위 20) ===")
for k, a in sorted(by_schdl.items(), key=lambda x: -x[1]["n"])[:20]:
    print(f"  schdl {k}: {a['n']}행 {len(a['persons'])}명 | 행:{'/'.join(a['subjects'])[:40]} | DB:{'/'.join(a['db_courses'])[:40]} | 상세:{a['session_course'][:40]}")
print()
print("XLSX:", OUT_X)
