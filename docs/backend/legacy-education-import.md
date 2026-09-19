# 레거시 교육 데이터 이관 — 구 감리협회 EDC 엑셀

> 버전: v1.0 · 2026-09-18
> 소스: `20260903★ 계속교육과목등록 (1).xlsx` (구 시스템 dump)
> 스크립트: `backend/api/app/scripts/import_legacy_education.py` (멱등 — 재실행 안전)

---

## 1. 실행 방법

```bash
cd backend/api
uv run python -m app.scripts.import_legacy_education "<엑셀 경로>"

# staging EC2 (SSM 접속 후) — 엑셀 파일을 서버에 먼저 업로드
docker compose exec api python -m app.scripts.import_legacy_education /tmp/edc.xlsx
```

## 2. 매핑 — 엑셀 4탭 → 테이블

| 엑셀 탭 | 대상 테이블 | 키 보존 |
|---|---|---|
| 감리원추가 | `trainees` | `trainee_no = EDU-{NO}` (NO = PARTC_SN) — 2026-09-18 LEG-에서 EDU-로 변경 |
| 계속교육과목 | `training_institutions` + `training_courses` | `course_code = EDC-{edc_sn}` |
| 계속교육과목상세 | `course_sessions` | `schedule_no = EDC_SCHDL_SN` |
| 수강신청 | `training_records` | `training_record_no = LEG-EDC-{SCHDL_SN}-{감리원키}` |

- 기관: 감리협회 컬럼 → find-or-create (이름 기준)
- 과정명: `{회차명} {과목명}` — 단, 회차명이 과목명을 이미 담고 있으면(외부기관 과정) 회차명만
- `category`: 교육구분 1=온라인, 2=집체
- 이력 스냅샷: 감리원증번호 → `supervisor_cert_no`, 감리원등급명 → `supervisor_grade`, `source='legacy_import'`

## 3. 조인 전략 (원본 데이터 결함 검증 완료)

```
수강신청 ──EDC_SCHDL_SN──→ 과목상desser ──edc_sn──→ 계속교육과목
   └──감리원키(PARTC_SN)──→ 감리원추가.NO
```

1순위: `SCHDL_SN` → `course_sessions.schedule_no`
2순위 (fallback): 회차명+과목명으로 course 역조회 — SCHDL_SN 미싱 16종 전부 해결
중복: 동일 (일정, 감리원) 중복 등록 31그룹은 record_no 키로 흡수 — 1건만 생성

⚠️ `EDC_SCHDL_SN` 원본에 **단독 중복 5종**(1490·1497·1498·1499·1509)이 있어
`schedule_no` 에 UNIQUE 제약을 걸지 않았다 — `(course_id, schedule_no)` 로 식별.

## 4. 이관 정산 — 원본 행 수 vs 이관 수 (로컬 기준, 2026-09-18)

### 감리원추가: 7,772행 → 교육생 **7,661**

| 차감 | 건수 | 내용 |
|---|---:|---|
| NO 비정상·이름 결측 | 18 | 정크 |
| 행 중복 (같은 사람 여러 NO) | 95 | 이름+생일 동일 → 병합. 구 시스템 재등록 흔적 |

### 계속교육과목: 2,656행 → 과정 **2,362** (+ 기관 83)

| 차감 | 건수 | 내용 |
|---|---:|---|
| edc_sn 없음 | 63 | 전 행 결측 정크 |
| 과목명/기관 결측 | 231 | "2018년 1차 전문교육 강의" 등 회차 플레이스홀더 — 과목명 없음 |

### 과목상desser: 3,812행 → 일정 **2,354**

| 차감 | 건수 | 내용 |
|---|---:|---|
| edc_sn / SCHDL_SN 비정상 | 1,233 | SCHDL_SN 결측 139(과목키2='00' 정크 다수), edc_sn 문자열 107 등 |
| orphan edc_sn | 4종 | 0, 735, 736, #N/A |

### 수강신청: 12,875행 → 이력 **9,262**

| 차감 | 건수 | 내용 |
|---|---:|---|
| `#N/A` 파손 | 3,564 | 구 시스템에서 이미 조인 깨짐 — `수강신청-오류` 탭(6,771행)과 겹침 추정 |
| 기타 정크 | 17 | 감리원키 미스(#N/A, 0, None) 포함 |
| (일정×교육생) 중복 | 31그룹 | 1건으로 병합 |

포함분: fallback 조인 376 · 일정 없는 이력 75 (course만 연결, 날짜 NULL)

## 5. 미결 / 남은 것

- **#N/A 수강신청 3,564건 미이관** — 회차명+과목명+이름+생일로 수동 복구 가능성 있음.
  복구 전 `수강신청-오류` 탭과 대조해 진짜 분실분인지 확인 필요
- `수강신청` 탭의 `입금여부` 컬럼은 이관하지 않음 (payment 도메인은 확인서 발급 결제용이라 별개)
- 과목상desser의 강사 필드는 원본 99.9% 결측이라 버림
- 과정명에 원본 non-breaking space(`\xa0`)가 남아 있는 케이스 있음 — 표기 이슈 외 실질 영향 없음

## 6. 스키마 변경 (v1.0과 함께 적용)

- 신규 테이블 `course_sessions` — 마이그레이션 `b2c3d4e5f6a7`
- `training_records.session_id` 추가 (FK→course_sessions SET NULL) — 일정별 수강생 역조회용
- 운영 흐름: 일정 등록 → 교육생 연결(다중) → 이력 일괄 생성 (`POST /api/training-records/bulk`)
