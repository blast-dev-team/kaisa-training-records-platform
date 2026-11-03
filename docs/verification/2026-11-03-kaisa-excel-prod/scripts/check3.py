"""Sheet3 고유분·김정희·수강신청-오류 매칭 판별."""
import json, csv, re
from collections import Counter
import openpyxl

NEW_X = '/tmp/kaisa_verify/decrypted/20260903-계속교육과목등록.xlsx'
new = json.load(open('/tmp/kaisa_verify/canonical/master_new.json'))
records = list(csv.DictReader(open('/tmp/kaisa_verify/prod/records.csv')))
trainees = list(csv.DictReader(open('/tmp/kaisa_verify/prod/trainees.csv')))

def clean(v):
    if v is None: return None
    t = str(v).strip(); return t or None

def norm(s): return re.sub(r'\s+', '', s or '')

all_edc = set()
for r in records:
    m = re.match(r'LEG-EDC-(\d+)-(\d+)$', r['training_record_no'])
    if m: all_edc.add((int(m.group(1)), int(m.group(2))))
valid_keys = {(e['schdl_sn'], e['partc_no']) for e in new['enrollments']
              if e['schdl_sn'] is not None and e['partc_no'] is not None}
enr_by_key = {}
for e in new['enrollments']:
    if e['schdl_sn'] is not None and e['partc_no'] is not None:
        enr_by_key.setdefault((e['schdl_sn'], e['partc_no']), e)

wb = openpyxl.load_workbook(NEW_X, read_only=True, data_only=True)

# 1. Sheet3 부재 키 → 수강신청 유효키 교차
m3_keys, dup_view = set(), 0
s3_meta = {}
for row in wb['Sheet3'].iter_rows(min_row=2, values_only=True):
    r = [clean(c) for c in row[:12]]
    if not any(r): continue
    try: k = (int(float(r[1])), int(float(r[2])))
    except (ValueError, TypeError, IndexError): continue
    if k in all_edc: continue
    m3_keys.add(k)
    s3_meta.setdefault(k, {'회차명': r[5], '과목명': r[6], '증번호': r[8], '이름': r[9], '생일': r[10]})
    if k in valid_keys: dup_view += 1
uniq = [k for k in m3_keys if k not in valid_keys]
print(f'Sheet3 부재 고유키 {len(m3_keys)} | 수강신청 유효키에도 존재(중복뷰) {dup_view} | 수강신청에도 없음(고유) {len(uniq)}')
print('고유분 샘플 10:')
for k in sorted(uniq)[:10]:
    print(' ', k, s3_meta.get(k))

# 2. 김 정 희 (공백 이름) 매칭
print()
for t in trainees:
    if norm(t['name_encrypted']) == '김정희' or (t['cert_no'] and '6149' in t['cert_no']):
        print('김정희 후보:', t['trainee_no'], t['name_encrypted'], '| cert:', t['cert_no'],
              '| birth:', t['birth_date'], '| grade:', t['supervisor_grade'],
              '| deleted:', t['deleted_at'][:10] if t['deleted_at'] else '-')

# 3. 수강신청-오류 55행 증번호 정규화 매칭
print()
tr_cert_norm = {}
for t in trainees:
    for k in ('cert_no', 'senior_cert_no'):
        if t[k]: tr_cert_norm[norm(t[k])] = t
err_rows_hit, err_rows_miss = [], []
seen_pairs = set()
for row in wb['수강신청-오류'].iter_rows(min_row=2, values_only=True):
    r = [clean(c) for c in row[:9]]
    if not any(r) or not r[6]: continue
    name, cert_raw = r[6], norm(r[5] or '')
    pair = (name, cert_raw, r[2])
    if pair in seen_pairs: continue
    seen_pairs.add(pair)
    hit = tr_cert_norm.get(cert_raw)
    if hit is None and cert_raw:
        # '서울 262호' → '서울 제262호' 스타일: 제 삽입 재시도
        m = re.match(r'^(.+?)\s*(\d+)호$', cert_raw)
        if m: hit = tr_cert_norm.get(f'{m.group(1)}제{m.group(2)}호')
    (err_rows_hit if hit else err_rows_miss).append(
        {'이름': name, '증번호원본': r[5], '회차명': r[2], '과목명': r[3],
         'DB후보': hit['trainee_no'] if hit else None})
wb.close()
print('오류 시트 고유 (이름+증번호+회차):', len(seen_pairs),
      '| 정규화 매칭 성공', len(err_rows_hit), '| 실패', len(err_rows_miss))
for e in err_rows_miss[:12]:
    print(' 실패:', e)
json.dump({'sheet3_unique_keys': [list(k) for k in uniq], 'sheet3_meta': {f'{k[0]}-{k[1]}': v for k, v in s3_meta.items() if k in uniq},
           'err_hit': err_rows_hit, 'err_miss': err_rows_miss},
          open('/tmp/kaisa_verify/report/check3.json', 'w'), ensure_ascii=False, indent=1)
