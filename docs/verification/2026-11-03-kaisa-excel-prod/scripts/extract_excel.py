"""Extract canonical lists from all KAISA Excel files → JSON files.

Sources:
- NEW master (decrypted 20260903): supervisors, courses, sessions, enrollments, external
- OLD master (Sep 18 copy): same, for diff
- 감리원 추가입력(2026.09.28)
- 교육내역 및 회원추가 명단 2026.10.12 (교육 + 회원)
- 2026.10.13 교육내역+회원 추가 요청건 (교육 + 회원)
- 2026.10.06 교육내역추가 요청건
- (2600930) 회원명부 평생/연간
"""
import json
import os
from datetime import date

import openpyxl

BASE = "/Users/choegilang/Desktop/KAISA excel"
NEW = "/tmp/kaisa_verify/decrypted/20260903-계속교육과목등록.xlsx"
OLD = os.path.join(BASE, "20260903★ 계속교육과목등록 (1).xlsx")
OUT = "/tmp/kaisa_verify/canonical"
os.makedirs(OUT, exist_ok=True)


def clean(v):
    if v is None:
        return None
    t = str(v).strip()
    return t or None


def parse_date(v):
    if v is None:
        return None
    if isinstance(v, date):
        return v.isoformat()
    s = str(v).strip()
    for sep in (".", "/", "-"):
        try:
            y, m, d = s.split(sep)
            return date(int(y), int(m), int(d)).isoformat()
        except (ValueError, AttributeError):
            continue
    return None


def parse_hours(v):
    if v is None:
        return 0
    try:
        return float(str(v).strip())
    except ValueError:
        return 0


def num(v):
    """int or None."""
    if isinstance(v, int):
        return v
    if isinstance(v, float) and v == int(v):
        return int(v)
    return None


def extract_master(path, label):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    data = {"label": label, "supervisors": [], "courses": [], "sessions": [],
            "enrollments": [], "external": []}
    for row in wb["감리원추가"].iter_rows(min_row=2, values_only=True):
        no = num(row[2])
        name = clean(row[3])
        if no is None or not name:
            continue
        data["supervisors"].append({
            "no": no, "name": name, "cert_no": clean(row[4]),
            "grade": clean(row[5]), "birth": parse_date(row[6]),
            "issued": parse_date(row[7]),
        })
    for row in wb["계속교육과목"].iter_rows(min_row=2, values_only=True):
        sn = num(row[2])
        if sn is None:
            continue
        data["courses"].append({
            "sn": sn, "institution": clean(row[3]), "session_name": clean(row[4]),
            "subject": clean(row[5]), "edu_div": num(row[7]),
        })
    for row in wb["계속교육과목상세"].iter_rows(min_row=2, values_only=True):
        edc_sn, schdl = num(row[0]), num(row[2])
        if edc_sn is None or schdl is None:
            continue
        data["sessions"].append({
            "edc_sn": edc_sn, "schdl_sn": schdl, "session_name": clean(row[4]),
            "subject": clean(row[5]), "start": parse_date(row[8]),
            "end": parse_date(row[9]), "hours": parse_hours(row[12]),
            "recognized": parse_hours(row[13]),
        })
    for row in wb["수강신청"].iter_rows(min_row=2, values_only=True):
        schdl, partc = row[1], row[2]
        data["enrollments"].append({
            "row": len(data["enrollments"]) + 2,
            "schdl_raw": str(schdl), "partc_raw": str(partc),
            "schdl_sn": num(schdl), "partc_no": num(partc),
            "hours": parse_hours(row[3]), "recognized": parse_hours(row[4]),
            "session_name": clean(row[5]), "subject": clean(row[6]),
            "cert_no": clean(row[8]), "name": clean(row[9]), "birth": parse_date(row[10]),
        })
    for rowno, row in enumerate(wb["외부교육수강기록"].iter_rows(min_row=2, values_only=True), start=1):
        inst, subject = clean(row[0]), clean(row[1])
        if not inst or not subject:
            continue
        data["external"].append({
            "rowno": rowno, "institution": inst, "subject": subject,
            "start": parse_date(row[2]), "end": parse_date(row[3]),
            "hours": parse_hours(row[4]), "recognized": parse_hours(row[5]),
            "cert_no": clean(row[6]), "name": clean(row[7]),
        })
    wb.close()
    return data


new = extract_master(NEW, "NEW")
old = extract_master(OLD, "OLD")
json.dump(new, open(f"{OUT}/master_new.json", "w"), ensure_ascii=False)
json.dump(old, open(f"{OUT}/master_old.json", "w"), ensure_ascii=False)

# 감리원 추가입력(2026.09.28)
wb = openpyxl.load_workbook(os.path.join(BASE, "감리원 추가입력(2026.09.28).xlsx"),
                            read_only=True, data_only=True)
add0928 = []
for row in wb["Sheet1"].iter_rows(min_row=2, values_only=True):
    no, name = num(row[0]), clean(row[1])
    if name is None and no is None:
        continue
    add0928.append({"no": no, "name": name, "phone": clean(row[2]),
                    "birth": parse_date(row[3]), "cert_no": clean(row[4]),
                    "grade": clean(row[5]), "issued": parse_date(row[6])})
wb.close()
json.dump(add0928, open(f"{OUT}/add_0928.json", "w"), ensure_ascii=False)

# 교육내역 및 회원추가 명단 2026.10.12
wb = openpyxl.load_workbook(os.path.join(BASE, "교육내역 및 회원추가 명단 2026.10.12.xlsx"),
                            read_only=True, data_only=True)
edu1012, mem1012 = [], []
for row in wb["교육내역 추가명단"].iter_rows(min_row=4, values_only=True):
    no = num(row[0])
    if not clean(row[2]):
        continue
    edu1012.append({"no": no, "cert_no": clean(row[1]), "name": clean(row[2]),
                    "birth": parse_date(row[3]), "institution": clean(row[4]),
                    "course": clean(row[5]), "start": parse_date(row[6]),
                    "end": parse_date(row[7]),
                    "hours": parse_hours(row[8])})
for row in wb["회원추가명단 "].iter_rows(min_row=4, values_only=True):
    no = num(row[0])
    if not clean(row[2]):
        continue
    mem1012.append({"no": no, "member_grade": clean(row[1]), "name": clean(row[2]),
                    "birth": parse_date(row[3]), "sup_grade": clean(row[4]),
                    "cert_no": clean(row[5]), "phone": clean(row[6]),
                    "email": clean(row[7]), "pay_date": parse_date(row[8]) if row[8] else None})
wb.close()
json.dump(edu1012, open(f"{OUT}/edu_1012.json", "w"), ensure_ascii=False)
json.dump(mem1012, open(f"{OUT}/mem_1012.json", "w"), ensure_ascii=False)

# 2026.10.13 요청건 — header row 1
wb = openpyxl.load_workbook(os.path.join(BASE, "2026.10.13-교육내역+회원 추가 요청건.xlsx"),
                            read_only=True, data_only=True)
edu1013, mem1013 = [], []
for row in wb["교육내역추가"].iter_rows(min_row=2, values_only=True):
    if not clean(row[0]):
        continue
    edu1013.append({"name": clean(row[0]), "cert_no": clean(row[1]),
                    "institution": clean(row[2]), "course": clean(row[3]),
                    "start": parse_date(row[4]), "end": parse_date(row[5]),
                    "hours": parse_hours(row[6])})
for row in wb["회원추가"].iter_rows(min_row=4, values_only=True):
    no = num(row[0])
    if not clean(row[2]):
        continue
    mem1013.append({"no": no, "member_grade": clean(row[1]), "name": clean(row[2]),
                    "birth": parse_date(row[3]), "sup_grade": clean(row[4]),
                    "cert_no": clean(row[5]), "phone": clean(row[6]),
                    "email": clean(row[7]), "pay_date": parse_date(row[8]) if row[8] else None})
wb.close()
json.dump(edu1013, open(f"{OUT}/edu_1013.json", "w"), ensure_ascii=False)
json.dump(mem1013, open(f"{OUT}/mem_1013.json", "w"), ensure_ascii=False)

# 2026.10.06 요청건
wb = openpyxl.load_workbook(os.path.join(BASE, "2026.10.06-교육내역추가 요청건.xlsx"),
                            read_only=True, data_only=True)
edu1006 = []
for row in wb["Sheet1"].iter_rows(min_row=4, values_only=True):
    no = num(row[0])
    if not clean(row[2]):
        continue
    edu1006.append({"no": no, "cert_no": clean(row[1]), "name": clean(row[2]),
                    "birth": parse_date(row[3]), "institution": clean(row[4]),
                    "course": clean(row[5]), "start": parse_date(row[6]),
                    "end": parse_date(row[7]), "hours": parse_hours(row[8])})
wb.close()
json.dump(edu1006, open(f"{OUT}/edu_1006.json", "w"), ensure_ascii=False)

# 회원명부 평생/연간
wb = openpyxl.load_workbook(os.path.join(BASE, "(2600930)_협회 회원명부(평생,연간) (1).xlsx"),
                            read_only=True, data_only=True)
life, annual = [], []
for row in wb["회원명부(평생회원)"].iter_rows(min_row=4, values_only=True):
    no = num(row[0])
    if not clean(row[2]):
        continue
    life.append({"no": no, "member_grade": clean(row[1]), "name": clean(row[2]),
                 "birth": parse_date(row[3]), "sup_grade": clean(row[4]),
                 "cert_no": clean(row[5]), "phone": clean(row[6]),
                 "email": clean(row[7])})
for row in wb["회원명부(연간회원) "].iter_rows(min_row=4, values_only=True):
    no = num(row[0])
    if not clean(row[2]):
        continue
    annual.append({"no": no, "member_grade": clean(row[1]), "name": clean(row[2]),
                   "birth": parse_date(row[3]), "sup_grade": clean(row[4]),
                   "cert_no": clean(row[5]), "phone": clean(row[6]),
                   "email": clean(row[7]), "pay26": parse_date(row[8])})
wb.close()
json.dump(life, open(f"{OUT}/members_lifetime.json", "w"), ensure_ascii=False)
json.dump(annual, open(f"{OUT}/members_annual.json", "w"), ensure_ascii=False)

# 요약
print("NEW supervisors:", len(new["supervisors"]), "courses:", len(new["courses"]),
      "sessions:", len(new["sessions"]), "enrollments:", len(new["enrollments"]),
      "external:", len(new["external"]))
print("OLD supervisors:", len(old["supervisors"]), "courses:", len(old["courses"]),
      "sessions:", len(old["sessions"]), "enrollments:", len(old["enrollments"]),
      "external:", len(old["external"]))
print("add0928:", len(add0928), "edu1012:", len(edu1012), "mem1012:", len(mem1012))
print("edu1013:", len(edu1013), "mem1013:", len(mem1013), "edu1006:", len(edu1006))
print("lifetime:", len(life), "annual:", len(annual))
