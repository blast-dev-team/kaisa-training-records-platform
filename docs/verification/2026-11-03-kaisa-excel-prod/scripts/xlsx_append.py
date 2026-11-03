"""기존 xlsx에 Sheet3·수강신청오류 시트 추가 + 요약 보강."""
import json
import openpyxl

OUT_X = "/Users/choegilang/Desktop/dev/kaisa-training-records-platform/docs/verification/2026-11-03-kaisa-excel-prod/미등록데이터-분류-2026-11-03.xlsx"
chk = json.load(open("/tmp/kaisa_verify/report/check3.json"))

wb = openpyxl.load_workbook(OUT_X)

# 요약 행 추가
ws = wb["요약"]
ws.append(["기타시트", "계속교육과목등록(NEW)", "Sheet3 고유 미이관", len(chk["sheet3_unique_keys"]), "수강신청 시트에도 없는 고유 수강기록 — 등록 가능(회차 조인)"])
ws.append(["기타시트", "계속교육과목등록(NEW)", "수강신청-오류 고유", len(chk["err_hit"]) + len(chk["err_miss"]), f"증번호 표기 불량 — 정규화 매칭 {len(chk['err_hit'])} / 오타 보정 필요 {len(chk['err_miss'])}"])
ws.append(["회원추가", "2026.10.13 요청건", "김 정 희 표기", 1, "EDU-6996 김정희(제5251호)와 동일인 추정 — 명부는 제6149호 표기(감리원 중복 4쌍 케이스)"])

rows3 = []
for k in chk["sheet3_unique_keys"]:
    key = f"{k[0]}-{k[1]}"
    m = chk["sheet3_meta"].get(key, {})
    rows3.append([k[0], k[1], f"LEG-EDC-{k[0]}-{k[1]}", m.get("회차명"), m.get("과목명"),
                  m.get("증번호"), m.get("이름"), m.get("생일")])
ws2 = wb.create_sheet("Sheet3_미이관고유")
ws2.append(["회차키", "감리원키", "record_no(제안)", "회차명", "과목명", "증번호", "이름", "생일"])
for r in rows3:
    ws2.append(r)

ws3 = wb.create_sheet("수강신청오류_고유")
ws3.append(["이름", "증번호(원본)", "회차명", "과목명", "정규화매칭", "DB후보"])
for e in chk["err_hit"]:
    ws3.append([e["이름"], e["증번호원본"], e["회차명"], e["과목명"], "O", e["DB후보"]])
for e in chk["err_miss"]:
    ws3.append([e["이름"], e["증번호원본"], e["회차명"], e["과목명"], "X(오타 보정 필요)", ""])

wb.save(OUT_X)
print("saved. sheets:", wb.sheetnames)
