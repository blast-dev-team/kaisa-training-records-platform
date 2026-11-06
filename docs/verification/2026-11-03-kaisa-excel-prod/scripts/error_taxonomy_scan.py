"""전수 오류 분류 — 마스터 원본(NEW 복호화) 8개 시트 + 요청건 + DB 키 불일치.

클래스:
A. 증번호 표기 불량 (오타·공백·축약·접두사 누락 — DB 정규화 매칭 실패)
B. #N/A / 비수치 셀
C. 생일·발급일자 결측·이상치 (연도 <1990)
D. SCHDL_SN이 상세 시트에 없음 (수강신청)
E. 상세: 기간 미기재 / 종료<시작 / 회차키 다중과정 사용
F. 감리원추가: cert 결측·중복, 정크행
G. Sheet3 고유 미이관
H. 수강신청-오류 시트 고유
I. 외부교육 표기 불량
"""
import csv
import json
import re
from collections import Counter, defaultdict

import openpyxl

NEW_X = "/tmp/kaisa_verify/decrypted/20260903-계속교육과목등록.xlsx"
P = "/tmp/kaisa_verify/prod"
OUT = ("/Users/choegilang/Desktop/dev/kaisa-training-records-platform/docs/verification/"
       "2026-11-03-kaisa-excel-prod/엑셀오류-키불일치-전수-2026-11-04.xlsx")


def clean(v):
    if v is None:
        return None
    t = str(v).strip()
    return t or None


def norm_cert(s):
    return re.sub(r"\s+", "", s or "")


def parse_dt(v):
    """'YYYY.MM.DD' → (date_str, ok, year)"""
    if v is None:
        return None, False, None
    if hasattr(v, "year"):
        return v.date().isoformat(), 1900 <= v.year <= 2030, v.year
    s = str(v).strip()
    m = re.match(r"^(\d{2,4})[.\-/](\d{1,2})[.\-/](\d{1,2})$", s)
    if not m:
        return s, False, None
    y = int(m.group(1))
    if y < 100:
        y += 2000 if y < 50 else 1900
    return f"{y:04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}", 1900 <= y <= 2030, y


# DB cert 정규화 집합
trainees = list(csv.DictReader(open(f"{P}/trainees.csv")))
db_certs = set()
for t in trainees:
    for k in ("cert_no", "senior_cert_no"):
        if t[k]:
            db_certs.add(norm_cert(t[k]))
db_no = {t["trainee_no"]: t for t in trainees}

wb = openpyxl.load_workbook(NEW_X, read_only=True, data_only=True)

cert_bad = []      # A. 증번호 표기 불량 (sheet, row, cert_raw, name, matched)
na_rows = []       # B. #N/A/비수치
date_bad = []      # C. 생일·발급일자 결측·이상치 (감리원추가)
schdl_missing = []  # D. SCHDL이 상세에 없음 (수강신청)
detail_issues = []  # E. 상세 문제
junk_rows = []     # F1. 정크
cert_dup = []      # F2. cert 중복 (같은 cert 여러 NO)
float_cells = Counter()
cert_bad_counter = Counter()

# 상세 세션 집계 먼저 — schdl → edc_sn set
ses_by_no = defaultdict(set)
detail_rows = []
for row in wb["계속교육과목상세"].iter_rows(min_row=2, values_only=True):
    edc, schdl = row[0], row[2]
    if not isinstance(edc, int) or not isinstance(schdl, int):
        continue
    ses_by_no[schdl].add(edc)
    st, st_ok, _ = parse_dt(row[8])
    en, en_ok, _ = parse_dt(row[9])
    if not st_ok or not en_ok:
        detail_rows.append({"schdl": schdl, "edc_sn": edc, "시작": st, "종료": en,
                            "사유": "기간 미기재" if not st_ok else "기간 형식 이상"})
    elif st > en:
        detail_rows.append({"schdl": schdl, "edc_sn": edc, "시작": st, "종료": en,
                            "사유": "종료<시작"})
multi_use_schdl = {k: sorted(v) for k, v in ses_by_no.items() if len(v) > 1}

# 감리원추가
sup_rows = {}
cert_by_norm = defaultdict(list)
for rowno, row in enumerate(wb["감리원추가"].iter_rows(min_row=2, values_only=True), start=2):
    no = row[2]
    name = clean(row[3])
    cert = clean(row[4])
    birth_raw = row[6]
    issued_raw = row[7]
    if not isinstance(no, int) or not name:
        junk_rows.append({"row": rowno, "raw": " | ".join(str(c) for c in row[:9] if c is not None)[:80]})
        continue
    birth, b_ok, _ = parse_dt(birth_raw)
    issued, i_ok, i_year = parse_dt(issued_raw)
    nc = norm_cert(cert)
    sup_rows.setdefault(no, []).append(rowno)
    if cert:
        cert_by_norm[nc].append((no, name, birth))
    if not cert:
        cert_bad.append({"시트": "감리원추가", "행": rowno, "증번호(원본)": "",
                         "이름": name, "NO": no, "문제": "증번호 결측"})
    elif nc not in db_certs:
        cert_bad.append({"시트": "감리원추가", "행": rowno, "증번호(원본)": cert,
                         "이름": name, "NO": no, "문제": "DB 매칭 실패(표기 불량)"})
        cert_bad_counter["감리원추가"] += 1
    if not b_ok:
        date_bad.append({"시트": "감리원추가", "행": rowno, "이름": name, "필드": "생일",
                         "값": str(birth_raw), "문제": "결측" if birth_raw is None else "형식 이상"})
    if i_ok and i_year < 1990 or (not i_ok and issued_raw is not None):
        date_bad.append({"시트": "감리원추가", "행": rowno, "이름": name, "필드": "발급일자",
                         "값": str(issued_raw)[:16], "문제": "연도 이상치" if i_year else "형식 이상"})

# cert 중복 (같은 정규화 cert, 여러 NO)
for nc, lst in cert_by_norm.items():
    nos = sorted({no for no, _, _ in lst})
    births = sorted({b for _, _, b in lst if b})
    if len(nos) > 1:
        cert_dup.append({"증번호(정규화)": nc, "NO목록": ", ".join(map(str, nos)),
                         "이름": ", ".join(sorted({n for _, n, _ in lst})),
                         "생년": ", ".join(births), "행수": len(lst)})

# 수강신청
for rowno, row in enumerate(wb["수강신청"].iter_rows(min_row=2, values_only=True), start=2):
    schdl_raw, partc_raw, birth_raw = row[1], row[2], row[10]
    name = clean(row[9])
    cert = clean(row[8])
    schdl, partc = row[1], row[2]
    for col, v in (("SCHDL_SN", schdl), ("감리원NO", partc)):
        if isinstance(v, float) and v.is_integer():
            float_cells[col] += 1
    problems = []
    if schdl in ("#N/A", None) or partc in ("#N/A", None):
        problems.append("#N/A/결측")
    elif isinstance(schdl, float) and schdl.is_integer():
        schdl = int(schdl)
    elif not isinstance(schdl, int):
        problems.append("SCHDL 비수치")
    if isinstance(partc, float) and partc.is_integer():
        partc = int(partc)
    elif not isinstance(partc, int):
        problems.append("감리원NO 비수치")
    if birth_raw in ("#N/A", None):
        problems.append("생일결측" if birth_raw is None else "생일 #N/A")
    if problems:
        na_rows.append({"행": rowno, "이름": name, "증번호(원본)": cert,
                        "SCHDL": str(schdl), "감리원NO": str(partc),
                        "회차명": clean(row[5]), "과목명": clean(row[6]),
                        "시간": clean(row[4]), "문제": " + ".join(problems)})
        continue
    if schdl not in ses_by_no:
        schdl_missing.append({"행": rowno, "SCHDL": schdl, "감리원NO": partc,
                              "이름": name, "증번호(원본)": cert,
                              "회차명": clean(row[5]), "과목명": clean(row[6])})
    if cert:
        nc = norm_cert(cert)
        if nc not in db_certs:
            cert_bad.append({"시트": "수강신청", "행": rowno, "증번호(원본)": cert,
                             "이름": name, "NO": partc, "문제": "DB 매칭 실패(표기 불량)"})
            cert_bad_counter["수강신청"] += 1

# 외부교육
ext_bad = []
for rowno, row in enumerate(wb["외부교육수강기록"].iter_rows(min_row=2, values_only=True), start=2):
    cert = clean(row[6])
    if not clean(row[0]) or not clean(row[1]):
        continue
    if not cert:
        ext_bad.append({"행": rowno, "이름": clean(row[7]), "증번호(원본)": "",
                        "과정": clean(row[1]), "문제": "증번호 결측"})
    elif norm_cert(cert) not in db_certs:
        ext_bad.append({"행": rowno, "이름": clean(row[7]), "증번호(원본)": cert,
                        "과정": clean(row[1]), "문제": "DB 매칭 실패(표기 불량)"})

# Sheet3 고유 (DB 키 대조)
records = list(csv.DictReader(open(f"{P}/records.csv")))
all_edc = set()
for r in records:
    m = re.match(r"LEG-EDC-(\d+)-(\d+)$", r["training_record_no"])
    if m:
        all_edc.add((int(m.group(1)), int(m.group(2))))
sheet3_unique = []
for row in wb["Sheet3"].iter_rows(min_row=2, values_only=True):
    r = [clean(c) for c in row[:12]]
    if not any(r):
        continue
    try:
        k = (int(float(r[1])), int(float(r[2])))
    except (ValueError, TypeError, IndexError):
        continue
    if k not in all_edc:
        sheet3_unique.append({"행": None, "회차키": k[0], "감리원키": k[1],
                              "record_no(제안)": f"LEG-EDC-{k[0]}-{k[1]}",
                              "회차명": r[5], "과목명": r[6], "증번호": r[8],
                              "이름": r[9], "생일": r[10]})

# 수강신청-오류 고유
invalid_pairs = set()
for row in wb["수강신청"].iter_rows(min_row=2, values_only=True):
    s, p = row[1], row[2]
    if s in ("#N/A", None) or p in ("#N/A", None) or clean(row[9]) is None:
        invalid_pairs.add((clean(row[9]), clean(row[8])))
err_unique = []
seen = set()
for row in wb["수강신청-오류"].iter_rows(min_row=2, values_only=True):
    r = [clean(c) for c in row[:9]]
    if not any(r):
        continue
    name, cert = r[6], r[5]
    pair = (name, cert, r[2])
    if pair in seen:
        continue
    seen.add(pair)
    if (name, cert) not in invalid_pairs:
        err_unique.append({"행": None, "이름": name, "증번호(원본)": cert,
                           "회차명": r[2], "과목명": r[3], "생일": r[7]})

wb.close()

out = {
    "A_cert_bad": {"total": len(cert_bad), "by_sheet": dict(cert_bad_counter)},
    "B_na_rows": len(na_rows), "float_cells": dict(float_cells),
    "C_date_bad": len(date_bad),
    "D_schdl_missing": len(schdl_missing),
    "E_detail": {"period_issues": len(detail_rows), "multi_use_schdl": multi_use_schdl},
    "F_junk": len(junk_rows), "F_cert_dup": cert_dup,
    "G_sheet3_unique": len(sheet3_unique),
    "H_err_unique": len(err_unique),
    "I_ext_bad": len(ext_bad),
}
json.dump({"out": out, "cert_bad": cert_bad, "na_rows": na_rows, "date_bad": date_bad,
           "schdl_missing": schdl_missing, "detail_rows": detail_rows,
           "junk_rows": junk_rows, "cert_dup": cert_dup,
           "sheet3_unique": sheet3_unique, "err_unique": err_unique, "ext_bad": ext_bad},
          open("/tmp/kaisa_verify/report/error_taxonomy.json", "w"), ensure_ascii=False, indent=1)

# xlsx
wb2 = openpyxl.Workbook()
wb2.remove(wb2.active)


def add_sheet(title, headers, rows):
    ws = wb2.create_sheet(title[:31])
    ws.append(headers)
    for r in rows:
        ws.append([r.get(h, "") if isinstance(r, dict) else r for h in headers])


summary_rows = [
    ["A. 증번호 표기 불량", len(cert_bad), f"감리원추가 {cert_bad_counter.get('감리원추가', 0)} + 수강신청 {cert_bad_counter.get('수강신청', 0)} + 외부교육 {len(ext_bad)}"],
    ["B. 수강신청 #N/A·비수치·생일결측 행", len(na_rows), f"float 셀: {dict(float_cells)}"],
    ["C. 생일·발급일자 결측·이상치", len(date_bad), "연도 1900 미만 등"],
    ["D. SCHDL_SN이 상세 시트에 없음", len(schdl_missing), "수강신청 행이 참조하는 회차가 상세에 없음"],
    ["E1. 상세 기간 미기재·이상", len(detail_rows), "시작·종료일 결측 또는 종료<시작"],
    ["E2. 상세 회차번호 다중 과정 사용", len(multi_use_schdl), f"{list(multi_use_schdl.items())[:8]}"],
    ["F1. 감리원추가 정크행", len(junk_rows), "NO·이름 결측"],
    ["F2. 감리원추가 증번호 중복", len(cert_dup), "같은 정규화 증번호가 여러 NO"],
    ["G. Sheet3 고유 미이관", len(sheet3_unique), "수강신청 시트에도 없는 수강기록"],
    ["H. 수강신청-오류 시트 고유", len(err_unique), "수강신청 시트에 없는 오류 목록"],
    ["I. 외부교육 표기 불량", len(ext_bad), "증번호 결측·매칭 실패"],
]
ws0 = wb2.create_sheet("요약")
ws0.append(["분류", "건수", "비고"])
for r in summary_rows:
    ws0.append(r)

add_sheet("A_증번호표기불량", ["시트", "행", "이름", "NO", "증번호(원본)", "문제"],
          sorted(cert_bad, key=lambda x: (x["시트"], x["행"])))
add_sheet("B_NA행", ["행", "이름", "증번호(원본)", "SCHDL", "감리원NO", "회차명", "과목명", "시간", "문제"], na_rows)
add_sheet("C_날짜결측이상", ["시트", "행", "이름", "필드", "값", "문제"], date_bad)
add_sheet("D_SCHDL상세부재", ["행", "SCHDL", "감리원NO", "이름", "증번호(원본)", "회차명", "과목명"], schdl_missing)
add_sheet("E_상세기간문제", ["schdl", "edc_sn", "시작", "종료", "사유"], detail_rows)
add_sheet("F1_정크행", ["row", "raw"], junk_rows)
add_sheet("F2_증번호중복", ["증번호(정규화)", "NO목록", "이름", "생년", "행수"], cert_dup)
add_sheet("G_Sheet3고유", ["회차키", "감리원키", "record_no(제안)", "회차명", "과목명", "증번호", "이름", "생일"], sheet3_unique)
add_sheet("H_수강신청오류고유", ["이름", "증번호(원본)", "회차명", "과목명", "생일"], err_unique)
add_sheet("I_외부교육불량", ["행", "이름", "증번호(원본)", "과정", "문제"], ext_bad)
wb2.save(OUT)

print(json.dumps(out, ensure_ascii=False, indent=1)[:1500])
print()
print("XLSX:", OUT)
