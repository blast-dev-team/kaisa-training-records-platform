"""기간 NULL 레코드 2,710건 원인 역추적 — 파일·시트·버전별 대조.

분류:
- A_상세날짜미기재: 세션 연결됨, 상세 시트에 날짜 없음 (구/신 버전 교차 → 신버전 복구 가능분 판별)
- B1_SCHDL상세부재: 수강신청의 SCHDL_SN이 상세 시트에 없음 (원본 불일치)
- B2_과정누락연쇄: SCHDL은 상세에 있으나 과정 결측으로 세션 미생성
"""
import csv
import json
import re
from collections import Counter, defaultdict

import openpyxl

C = "/tmp/kaisa_verify/canonical"
P = "/tmp/kaisa_verify/prod"
OUT_X = "/Users/choegilang/Desktop/dev/kaisa-training-records-platform/docs/verification/2026-11-03-kaisa-excel-prod/기간미입력-원인분석-2026-11-03.xlsx"

new = json.load(open(f"{C}/master_new.json"))
old = json.load(open(f"{C}/master_old.json"))
records = list(csv.DictReader(open(f"{P}/records.csv")))
sessions_db = list(csv.DictReader(open(f"{P}/sessions.csv")))
courses_db = list(csv.DictReader(open(f"{P}/courses.csv")))
trainees = list(csv.DictReader(open(f"{P}/trainees.csv")))

tr_by_id = {t["id"]: t for t in trainees}
code_by_cid = {c["id"]: c["course_code"] for c in courses_db}
name_by_cid = {c["id"]: c["name"] for c in courses_db}
sess_by_id = {s["id"]: s for s in sessions_db}

# canonical: schdl → dates (first-wins, import와 동일)
def canon_by_file(data):
    d = {}
    for s in data["sessions"]:
        d.setdefault(s["schdl_sn"], s)
    return d

canon_new = canon_by_file(new)
canon_old = canon_by_file(old)
enr_by_key = {}
for e in new["enrollments"]:
    if e["schdl_sn"] is not None and e["partc_no"] is not None:
        enr_by_key.setdefault((e["schdl_sn"], e["partc_no"]), e)

null_recs = [r for r in records
             if r["deleted_at"] == "" and r["training_record_no"].startswith("LEG-EDC-")
             and not r["started_at"]]
print("대상:", len(null_recs))

cls_count = Counter()
recover_new = Counter()   # A 원인 중 NEW에 날짜 있음
out_rows = []
sess_null_recs = Counter()   # schdl → record count

for r in null_recs:
    m = re.match(r"LEG-EDC-(\d+)-(\d+)$", r["training_record_no"])
    schdl, partc = int(m.group(1)), int(m.group(2))
    sid = r["session_id"]
    t = tr_by_id.get(r["trainee_id"], {})
    row = {"record_no": r["training_record_no"], "이름": t.get("name_encrypted"),
           "증번호": t.get("cert_no"), "과정": r["course_name"][:40],
           "기관": r["institution_name"][:25], "시간": r["total_hours"],
           "schdl": schdl}
    if sid:
        s = sess_by_id.get(sid)
        sch_db = int(float(s["schedule_no"])) if s["schedule_no"] else None
        cn = canon_new.get(schdl)
        co = canon_old.get(schdl)
        new_dates = bool((cn or {}).get("start"))
        old_dates = bool((co or {}).get("start"))
        if new_dates and not old_dates:
            cause = "A2_신버전에날짜있음_백필가능"
            recover_new["records"] += 1
        elif not new_dates and not old_dates:
            cause = "A1_원본날짜미기재"
        elif new_dates and old_dates:
            cause = "A3_이상_양버전날짜있음"
        else:
            cause = "A4_이상_구버전만있음"
        cls_count[cause] += 1
        row.update({"원인": cause, "상세schdl": sch_db, "구버전날짜": (co or {}).get("start") or "없음",
                    "신버전날짜": (cn or {}).get("start") or "없음",
                    "회차명": (cn or co or {}).get("session_name"), "과목명": (cn or co or {}).get("subject")})
    else:
        in_new_ses = schdl in canon_new
        in_old_ses = schdl in canon_old
        e = enr_by_key.get((schdl, partc))
        if in_new_ses or in_old_ses:
            cause = "B2_과정누락_세션미생성"
        else:
            cause = "B1_SCHDL이상세에없음"
        cls_count[cause] += 1
        row.update({"원인": cause, "상세schdl": "", "구버전날짜": "세션없음", "신버전날짜": "세션없음",
                    "회차명": (e or {}).get("session_name") or r["course_name"], "과목명": (e or {}).get("subject")})
    out_rows.append(row)

# A원인 세션 집계 (schdl별)
sess_agg = defaultdict(lambda: {"n": 0, "cause": "", "new": "", "old": "", "name": "", "subject": "", "edc": ""})
for row in out_rows:
    if row["원인"].startswith("A"):
        k = row["schdl"]
        a = sess_agg[k]
        a["n"] += 1
        a["cause"] = row["원인"]
        a["new"] = row["신버전날짜"]
        a["old"] = row["구버전날짜"]
        a["name"] = row["회차명"]
        a["subject"] = row["과목명"]

print("원인별:", dict(cls_count))
print("백필가능(신버전 날짜 존재) 레코드:", recover_new["records"])
print("관련 세션 수:", len(sess_agg), "| 그 중 신버전 날짜 있음:",
      sum(1 for a in sess_agg.values() if a["new"] not in ("", "없음")))
course_top = Counter(r["과정"] for r in out_rows)
print("과정별 top10:")
for k, v in course_top.most_common(10):
    print(f"  {v:5} {k}")

json.dump({"cls_count": dict(cls_count), "recover_records": recover_new["records"],
           "sessions": {str(k): v for k, v in sess_agg.items()},
           "rows": out_rows},
          open("/tmp/kaisa_verify/report/null_period_analysis.json", "w"), ensure_ascii=False)

# xlsx
wb = openpyxl.Workbook()
wb.remove(wb.active)


def add_sheet(title, headers, rows):
    ws = wb.create_sheet(title[:31])
    ws.append(headers)
    for r in rows:
        ws.append(r)


add_sheet("요약", ["원인", "건수", "설명"], [
    ["A1_원본날짜미기재", cls_count.get("A1_원본날짜미기재", 0), "상세 시트에 회차는 있으나 시작·종료일 미기재(구·신버전 모두) — 협회 원본 문제"],
    ["A2_신버전날짜추가됨", cls_count.get("A2_신버전에날짜있음_백필가능", 0), "구버전(9/18 임포트 기준)엔 없던 날짜가 신버전(11/3)에 기재됨 — 백필 가능"],
    ["A3/A4_이상", cls_count.get("A3_이상_양버전날짜있음", 0) + cls_count.get("A4_이상_구버전만있음", 0), "조인 이상 — 개별 확인 필요"],
    ["B1_SCHDL상세부재", cls_count.get("B1_SCHDL이상세에없음", 0), "수강신청의 SCHDL_SN이 상세 시트에 없음 — 원본 수강신청↔상세 불일치"],
    ["B2_과정누락_세션미생성", cls_count.get("B2_과정누락_세션미생성", 0), "SCHDL은 상세에 있으나 과정 결측(ㅡ/신규)으로 세션이 만들어지지 않음"],
])
add_sheet("레코드_전체", ["record_no", "이름", "증번호", "과정", "기관", "시간", "schdl", "원인", "회차명", "과목명", "구버전날짜", "신버전날짜"],
          [[r["record_no"], r["이름"], r["증번호"], r["과정"], r["기관"], r["시간"], r["schdl"],
            r["원인"], r["회차명"], r["과목명"], r["구버전날짜"], r["신버전날짜"]] for r in out_rows])
add_sheet("세션별_집계", ["schdl", "레코드수", "원인", "회차명", "과목명", "구버전날짜", "신버전날짜"],
          [[k, v["n"], v["cause"], v["name"], v["subject"], v["old"], v["new"]] for k, v in sorted(sess_agg.items(), key=lambda x: -x[1]["n"])])
wb.save(OUT_X)
print("XLSX saved:", OUT_X)
