"""미등록·누락 데이터 전수 분류 — 파일별·원인별 + xlsx 산출물."""
import csv
import json
import re
from collections import Counter, defaultdict

import openpyxl

C = "/tmp/kaisa_verify/canonical"
P = "/tmp/kaisa_verify/prod"
R = "/tmp/kaisa_verify/report"
NEW_X = "/tmp/kaisa_verify/decrypted/20260903-계속교육과목등록.xlsx"
OUT_X = "/Users/choegilang/Desktop/dev/kaisa-training-records-platform/docs/verification/2026-11-03-kaisa-excel-prod/미등록데이터-분류-2026-11-03.xlsx"

def clean(v):
    if v is None:
        return None
    t = str(v).strip()
    return t or None

new = json.load(open(f"{C}/master_new.json"))
old = json.load(open(f"{C}/master_old.json"))
add0928 = json.load(open(f"{C}/add_0928.json"))
edu1012 = json.load(open(f"{C}/edu_1012.json"))
edu1013 = json.load(open(f"{C}/edu_1013.json"))
mem1013 = json.load(open(f"{C}/mem_1013.json"))
mem1012 = json.load(open(f"{C}/mem_1012.json"))
lifetime = json.load(open(f"{C}/members_lifetime.json"))
annual = json.load(open(f"{C}/members_annual.json"))

trainees = list(csv.DictReader(open(f"{P}/trainees.csv")))
records = list(csv.DictReader(open(f"{P}/records.csv")))
courses = list(csv.DictReader(open(f"{P}/courses.csv")))
live = [r for r in records if not r["deleted_at"]]
db_tr_by_no = {t["trainee_no"]: t for t in trainees if t["trainee_no"]}
tr_by_id = {t["id"]: t for t in trainees}
live_edc_keys = set()
for r in live:
    m = re.match(r"LEG-EDC-(\d+)-(\d+)$", r["training_record_no"])
    if m:
        live_edc_keys.add((int(m.group(1)), int(m.group(2))))
all_edc_keys = live_edc_keys | {
    (int(m.group(1)), int(m.group(2)))
    for r in records
    for m in [re.match(r"LEG-EDC-(\d+)-(\d+)$", r["training_record_no"])]
    if m
}
db_course_by_code = {c["course_code"]: c for c in courses if c["course_code"]}
ext_courses = {(c["name"], (tr_by_id.get(r["trainee_id"]) or {}).get(""))
               for c in []}

out = {}

# ---------- 1. 마스터 수강신청 ----------
valid = [e for e in new["enrollments"] if e["schdl_sn"] is not None and e["partc_no"] is not None]
invalid = [e for e in new["enrollments"] if e["schdl_sn"] is None or e["partc_no"] is None]
key_count = Counter((e["schdl_sn"], e["partc_no"]) for e in valid)
dup_keys = {k: v for k, v in key_count.items() if v > 1}
dup_rows = sum(v - 1 for v in dup_keys.values())
old_keys = {(e["schdl_sn"], e["partc_no"]) for e in old["enrollments"]
            if e["schdl_sn"] is not None and e["partc_no"] is not None}
new_only = [e for e in valid if (e["schdl_sn"], e["partc_no"]) not in old_keys]
new_only_missing = [e for e in new_only
                    if (e["schdl_sn"], e["partc_no"]) not in all_edc_keys]
invalid_breakdown = Counter()
for e in invalid:
    if e["schdl_raw"] == "#N/A" or e["partc_raw"] == "#N/A":
        invalid_breakdown["#N/A"] += 1
    else:
        invalid_breakdown["비수치"] += 1

# 기간 NULL 등록분 (수강신청 소스 live 중 날짜 없음)
null_period = [r for r in live if r["training_record_no"].startswith("LEG-EDC-")
               and not r["started_at"]]
# 세션 기간 NULL 원본
null_sessions = [s for s in new["sessions"] if not s["start"] and not s["end"]]

out["수강신청"] = {
    "총행": len(new["enrollments"]), "유효": len(valid),
    "R1_비유효_등록불가": {"count": len(invalid), "breakdown": dict(invalid_breakdown)},
    "R2_중복흡수_1행만등록": {"dup_keys": len(dup_keys), "absorbed_rows": dup_rows},
    "R3_신규분_미반영": {"count": len(new_only_missing), "rows": new_only_missing},
    "R4_기간NULL_등록됨": {"count": len(null_period)},
    "기간미기재_세션_원본": {"count": len(null_sessions)},
}

# ---------- 2. 마스터 일정/과정 ----------
course_missing = [c for c in new["courses"] if f"EDC-{c['sn']}" not in db_course_by_code]
c_recl = Counter()
c_skip, c_new = [], []
for c in course_missing:
    if not c["subject"] or not c["institution"] or (c["subject"] == "ㅡ"):
        c_recl["결측_제외"] += 1
        if len(c_skip) < 500:
            c_skip.append(c)
    else:
        c_recl["NEW_신규"] += 1
        c_new.append(c)
ses_missing = []
canon_ses_keys = {(s["edc_sn"], s["schdl_sn"]) for s in new["sessions"]}
new_course_by_sn = {c["sn"]: c for c in new["courses"]}
for s in new["sessions"]:
    code = f"EDC-{s['edc_sn']}"
    if code not in db_course_by_code:
        ses_missing.append(s)
s_recl = Counter()
s_skip, s_new = [], []
for s in ses_missing:
    src = new_course_by_sn.get(s["edc_sn"])
    if src is None or not src["subject"] or not src["institution"] or src["subject"] == "ㅡ":
        s_recl["과정결측_연쇄"] += 1
        s_skip.append(s)
    else:
        s_recl["NEW신규과정_연쇄"] += 1
        s_new.append(s)
out["과정"] = {"총": len(new["courses"]), "미이관_결측": {"count": c_recl["결측_제외"], "rows": c_skip},
               "미이관_신규": {"count": c_recl["NEW_신규"], "rows": c_new}}
out["일정"] = {"총": len(new["sessions"]), "미이관_과정결측연쇄": {"count": s_recl["과정결측_연쇄"], "rows": s_skip},
               "미이관_NEW신규연쇄": {"count": s_recl["NEW신규과정_연쇄"], "rows": s_new},
               "기간미기재_세션": {"count": len(null_sessions)}}

# ---------- 3. 감리원추가 ----------
old_nos = {s["no"] for s in old["supervisors"]}
new_only_sup = [s for s in new["supervisors"] if s["no"] not in old_nos]
junk_rows = []
wb = openpyxl.load_workbook(NEW_X, read_only=True, data_only=True)
for rowno, row in enumerate(wb["감리원추가"].iter_rows(min_row=2, values_only=True), start=2):
    no = row[2]
    if not isinstance(no, int) or not clean(row[3]):
        junk_rows.append({"row": rowno, "raw": " | ".join(str(c) for c in row[:9] if c is not None)[:80]})
    # 발급일자 열 — EDU행에 반영됐는지 샘플
wb.close()
out["감리원추가"] = {
    "총유효": len(new["supervisors"]),
    "P1_신규_미반영": {"count": len(new_only_sup), "rows": new_only_sup},
    "P2_정크행": {"count": len(junk_rows), "rows": junk_rows[:50]},
    "P3_번호미보존": {"count": 1, "rows": [{"name": "백승철", "no": 4239, "cert": "부산 제22호"}]},
}

# 발급일자 열 미이관 확인: EDU 행 cert_issued_date NULL 비율
edu_rows = [t for t in trainees if (t["trainee_no"] or "").startswith("EDU-")]
null_issued = sum(1 for t in edu_rows if not t["cert_issued_date"])
out["감리원추가"]["발급일자열_미이관"] = {"count": null_issued, "total_edu": len(edu_rows)}

# ---------- 4. 추가입력 0928 ----------
tr_0928 = [t for t in trainees if (t["trainee_no"] or "").startswith("TR-20260928")]
cert_null = [t for t in tr_0928 if not t["cert_no"]]
import os as _os
_phone_file = f"{P}/tr_phone_null.txt"
phone_null_n = int(open(_phone_file).read().strip()) if _os.path.exists(_phone_file) else -1
name_set_0928 = {clean(a["name"]) for a in add0928}
phone_in_sheet = sum(1 for a in add0928 if a["phone"])
matched_names = {t["name_encrypted"] for t in tr_0928}
unregistered_0928 = [a for a in add0928 if clean(a["name"]) not in matched_names]
out["추가입력0928"] = {
    "명단": len(add0928), "TR등록": len(tr_0928),
    "미등록": {"count": len(unregistered_0928), "rows": unregistered_0928},
    "증번호열_누락": {"count": len(cert_null), "rows": [{k: t[k] for k in ("trainee_no", "name_encrypted", "birth_date", "supervisor_grade")} for t in cert_null]},
    "전화번호_명단보유": phone_in_sheet, "전화번호_미입력": phone_null_n,
}

# ---------- 5. 요청건/명단 회원 추가 ----------
tr_names = Counter(t["name_encrypted"] for t in trainees if not t["deleted_at"])
mem1013_unreg = [m for m in mem1013 if m["name"] not in tr_names]
mem1012_unreg = [m for m in mem1012 if m["name"] not in tr_names]
out["요청건회원"] = {
    "1013": {"총": len(mem1013), "미등록": {"count": len(mem1013_unreg), "rows": mem1013_unreg}},
    "1012": {"총": len(mem1012), "미등록": {"count": len(mem1012_unreg), "rows": mem1012_unreg}},
}

# ---------- 6. 수강신청-오류 시트 / Sheet3 / 온라인수료증 / 시간확인용 ----------
err_rows, sheet3_rows, online_rows = [], [], []
wb_extra = openpyxl.load_workbook(NEW_X, read_only=True, data_only=True)
for row in wb_extra["수강신청-오류"].iter_rows(min_row=2, values_only=True):
    vals = [clean(c) for c in row[:9]]
    if any(vals):
        err_rows.append(vals)
for row in wb_extra["Sheet3"].iter_rows(min_row=2, values_only=True):
    vals = [clean(c) for c in row[:12]]
    if any(vals):
        sheet3_rows.append(vals)
for row in wb_extra["온라인계속교육수료증"].iter_rows(min_row=2, values_only=True):
    vals = [clean(c) for c in row[:7]]
    if any(vals):
        online_rows.append(vals)
wb_extra.close()
# 수강신청-오류 ↔ 수강신청 비유효행 중복 여부: (이름, 증번호) 세트
err_pairs = Counter((r[6], r[5]) for r in err_rows if len(r) > 6)
invalid_pairs = Counter((e["name"], e["cert_no"]) for e in invalid)
err_only = sum(1 for k, v in err_pairs.items() if invalid_pairs.get(k, 0) == 0)
# Sheet3 → LEG-EDC 키 존재율
s3_keys, s3_hit = 0, 0
for r in sheet3_rows:
    try:
        k = (int(float(r[1])), int(float(r[2])))
    except (ValueError, TypeError, IndexError):
        continue
    s3_keys += 1
    s3_hit += k in all_edc_keys
out["기타시트"] = {
    "수강신청오류": {"행": len(err_rows), "수강신청시트에_없는_고유쌍": err_only},
    "Sheet3": {"행": len(sheet3_rows), "키화_가능": s3_keys, "DB존재": s3_hit, "DB부재": s3_keys - s3_hit},
    "온라인수료증": {"행": len(online_rows), "비고": "임포트 대상 시트 아님(설계) — 수강신청·외부교육 경계 중복 추정, 전수 대조 미실시"},
    "시간확인용": {"행": 5275, "비고": "동일 — 임포트 대상 시트 아님(설계)"},
}

# ---------- 7. 외부교육 ----------
out["외부교육"] = {
    "유효": len(new["external"]),
    "정크_열누락": {"count": 1, "rows": [{"rowno": 152, "institution": "한국소프트웨어기술진흥협회", "subject": "JIRA 실무에서 자유자재로 활용하기-심화", "사유": "이름·증번호 열 결측"}]},
    "삭제_10_21": 14,
}

json.dump(out, open(f"{R}/unregistered.json", "w"), ensure_ascii=False, indent=1)

# ---------- xlsx ----------
wb = openpyxl.Workbook()
wb.remove(wb.active)


def add_sheet(title, headers, rows):
    ws = wb.create_sheet(title[:31])
    ws.append(headers)
    for r in rows:
        ws.append(r)


add_sheet("요약", ["구분", "파일", "분류", "건수", "성격"],
          [
           ["수강신청", "계속교육과목등록(NEW)", "R1 비유효행(#N/A 등)", len(invalid), "등록 불가(원본 정크)"],
           ["수강신청", "계속교육과목등록(NEW)", "R2 중복행 흡수", dup_rows, f"중복키 {len(dup_keys)}종 — 첫 행만 등록(의도)"],
           ["수강신청", "계속교육과목등록(NEW)", "R3 신규분 미반영", len(new_only_missing), "임포트 예정(마스터 최신분)"],
           ["수강신청", "계속교육과목등록(NEW)", "R4 등록됨·기간NULL", len(null_period), "원본 세션 부재(정상 등록)"],
           ["일정", "계속교육과목등록(NEW)", "과정결측 연쇄 미이관", s_recl["과정결측_연쇄"], "ㅡ/빈 과목·기관 — 의도 제외"],
           ["일정", "계속교육과목등록(NEW)", "NEW신규과정 연쇄 미이관", s_recl["NEW신규과정_연쇄"], "임포트 예정"],
           ["일정", "계속교육과목등록(NEW)", "기간 미기재 세션", len(null_sessions), "원본에 날짜 없음(NULL 등록)"],
           ["과정", "계속교육과목등록(NEW)", "결측 미이관", c_recl["결측_제외"], "ㅡ/빈 과목·기관"],
           ["과정", "계속교육과목등록(NEW)", "NEW 신규 미이관", c_recl["NEW_신규"], "임포트 예정(28개는 external과정 이미 존재)"],
           ["감리원추가", "계속교육과목등록(NEW)", "신규 미반영", len(new_only_sup), "TR 병합 후 임포트 예정"],
           ["감리원추가", "계속교육과목등록(NEW)", "정크행", len(junk_rows), "번호/이름 결측"],
           ["감리원추가", "계속교육과목등록(NEW)", "증번호 미보존(백승철)", 1, "부산 제22호 — senior 축 추가 권장"],
           ["감리원추가", "계속교육과목등록(NEW)", "발급일자 열 미이관", null_issued, f"EDU {len(edu_rows)}명 전체 — 설계상 미수집"],
           ["추가입력0928", "감리원 추가입력", "증번호 열 누락(TR)", len(cert_null), "등록됨 — cert 비어있음"],
           ["추가입력0928", "감리원 추가입력", "전화번호 미입력", phone_null_n, f"명단 보유 {phone_in_sheet}명 중"],
           ["회원추가", "2026.10.13 요청건", "미등록", len(mem1013_unreg), "번호 미부여 대기 등"],
           ["회원명부", "협회 회원명부", "등급 미적용", 1, "정원우(연간) — 번호 미부여"],
           ["외부교육", "계속교육과목등록(NEW)", "정크(열 누락)", 1, "rowno 152 — 이름·증번호 결측"],
           ["기타시트", "계속교육과목등록(NEW)", "온라인수료증 미이관", len(online_rows), "설계상 대상 아님"],
           ["기타시트", "계속교육과목등록(NEW)", "시간확인용 미이관", 5275, "설계상 대상 아님"],
           ["기타시트", "계속교육과목등록(NEW)", "수강신청-오류 시트", len(err_rows), f"고유쌍 {err_only} — 수강신청 시트 중복 여부"],
           ["기타시트", "계속교육과목등록(NEW)", "Sheet3", len(sheet3_rows), f"DB존재 {s3_hit}/{s3_keys}"],
           ])

if new_only_missing:
    add_sheet("R3_수강신청_신규미반영", ["row", "schdl", "partc", "record_no", "이름", "증번호", "회차명", "과목명", "시간"],
              [[e["row"], e["schdl_sn"], e["partc_no"], f"LEG-EDC-{e['schdl_sn']}-{e['partc_no']}",
                e["name"], e["cert_no"], e["session_name"], e["subject"], e["recognized"]] for e in new_only_missing])
if c_new:
    add_sheet("과정_NEW신규", ["sn", "기관", "회차명", "과목명"],
              [[c["sn"], c["institution"], c["session_name"], c["subject"]] for c in c_new])
if s_new:
    add_sheet("일정_NEW신규연쇄", ["edc_sn", "schdl_sn", "회차명", "과목명", "시작", "종료", "시간"],
              [[s["edc_sn"], s["schdl_sn"], s["session_name"], s["subject"], s["start"], s["end"], s["recognized"]] for s in s_new])
if new_only_sup:
    add_sheet("감리원_신규미반영", ["NO", "이름", "증번호", "등급", "생년", "발급일"],
              [[s["no"], s["name"], s["cert_no"], s["grade"], s["birth"], s["issued"]] for s in new_only_sup])
if cert_null:
    add_sheet("추가입력_증번호누락", ["trainee_no", "이름", "생년", "등급"],
              [[t["trainee_no"], t["name_encrypted"], t["birth_date"], t["supervisor_grade"]] for t in cert_null])
if mem1013_unreg:
    add_sheet("회원추가1013_미등록", ["번호", "구분", "이름", "생년", "감리원등급", "증번호", "연락처", "이메일", "납부일"],
              [[m["no"], m["member_grade"], m["name"], m["birth"], m["sup_grade"], m["cert_no"], m["phone"], m["email"], m["pay_date"]] for m in mem1013_unreg])
if junk_rows:
    add_sheet("감리원추가_정크행", ["엑셀행", "원문(앞80자)"], [[j["row"], j["raw"]] for j in junk_rows])
if null_period:
    tr_idx = {t["id"]: t for t in trainees}
    add_sheet("R4_기간NULL_등록건", ["record_no", "이름", "증번호", "과정", "기관", "시간"],
              [[r["training_record_no"], (tr_idx.get(r["trainee_id"]) or {}).get("name_encrypted"),
                (tr_idx.get(r["trainee_id"]) or {}).get("cert_no"), r["course_name"][:40],
                r["institution_name"][:20], r["total_hours"]] for r in null_period])
if null_sessions:
    add_sheet("기간미기재_세션", ["edc_sn", "schdl_sn", "회차명", "과목명", "시간"],
              [[s["edc_sn"], s["schdl_sn"], s["session_name"], s["subject"], s["recognized"]] for s in null_sessions])
if s_skip:
    add_sheet("일정_과정결측연쇄", ["edc_sn", "schdl_sn", "회차명", "과목명"],
              [[s["edc_sn"], s["schdl_sn"], s["session_name"], s["subject"]] for s in s_skip])
if c_skip:
    add_sheet("과정_결측", ["sn", "기관", "회차명", "과목명"],
              [[c["sn"], c["institution"], c["session_name"], c["subject"]] for c in c_skip])
if unregistered_0928:
    add_sheet("추가입력_미등록", ["번호", "이름", "생년", "증번호", "등급"],
              [[a["no"], a["name"], a["birth"], a["cert_no"], a["grade"]] for a in unregistered_0928])

wb.save(OUT_X)
print("XLSX saved:", OUT_X)

print()
print("=== 집계 ===")
for k, v in out.items():
    if isinstance(v, dict):
        line = f"{k}: "
        for kk, vv in v.items():
            if isinstance(vv, dict) and "count" in vv:
                line += f"{kk}={vv['count']} "
            elif isinstance(vv, (int, str)):
                line += f"{kk}={vv} "
        print(line)
print()
print("수강신청-오류 고유쌍:", err_only, "/", len(err_rows))
print("Sheet3:", s3_hit, "/", s3_keys, "DB 존재")
print("기간NULL 등록:", len(null_period), "| 기간미기재 세션:", len(null_sessions))
print("발급일자 미이관:", null_issued, "/", len(edu_rows))
print("추가입0928: TR", len(tr_0928), "cert누락", len(cert_null), "전화누락", phone_null_n, f"(명단보유 {phone_in_sheet})")
print("회원추가1013 미등록:", len(mem1013_unreg), "| 1012 미등록:", len(mem1012_unreg))
