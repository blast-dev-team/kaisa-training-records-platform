---
name: crm-prod-data
description: "프로덕션(실섭) CRM 데이터를 조회·수정하는 안전 절차. 계약에 에이전시 연결, 중복 청구/회차 제거, 잘못된 필드 정정 같은 운영 데이터 요청을 처리할 때 사용한다. 항상 읽기 전용 조사 → 영향 분석 → 사용자 명시 승인 → 트랜잭션+가드 실행 → 사후 재조회 검증 순서. '실섭 데이터', '프로덕션 계약 고쳐줘', '중복 회차 제거', '에이전시 연결해줘' 같은 요청 시 이 절차를 따른다. 스테이징도 동일 절차(접속정보만 다름)."
---

# CRM Prod Data — 프로덕션 데이터 조회·수정 안전 절차

실서비스 데이터를 건드리는 작업. **되돌리기 어렵고 고객 청구·금액에 직결**되므로 아래 절차를 예외 없이 따른다.

## 철칙 (Iron Rules)
1. **읽기 먼저.** 요청을 받으면 무조건 read-only 조사부터. 상황 파악 전에 쓰기 금지.
2. **명시적 승인 없이 쓰기 금지.** 조사 결과 + 영향 분석을 제시하고 사용자의 "진행해" 를 받은 뒤에만 INSERT/UPDATE/DELETE.
3. **수납(payment)이 걸린 행은 삭제하지 않는다.** 금전 기록 유실. 반드시 사전 확인.
4. **트랜잭션 + 가드**로 실행. 예상 행수와 다르면 롤백.
5. **사후 재조회 검증** 필수. 실행 결과를 눈으로 확인해 보여준다.
6. 접속정보는 `ref/crm/connection/production.md`(스테이징은 `staging.md`)에서 **스크립트가 읽게** 한다. **비밀번호를 명령줄·출력에 노출하지 않는다.**

## 절차

### ① 읽기 전용 조사
- 대상 레코드의 현재 상태, 연결된 하위 데이터(청구서·수납·스케줄), 관련 마스터가 이미 있는지 확인.
- "사용자가 말한 전제"를 그대로 믿지 말고 **데이터로 검증**한다(예: "회사가 없다" → 실제론 이미 있었던 사례 다수).

### ② 영향 분석 → 제시
사용자에게 다음을 명확히:
- **무엇이 어떻게 바뀌는지** (필드 단위)
- **금전 영향** — 청구액·미수금이 변하나? 청구서는 스냅샷이라 안 변하나?
- **되돌릴 수 있나**
- **참조 무결성** — 지우려는 행을 참조하는 테이블이 있나 (아래 §참고)

### ③ 승인 게이트
사용자 확인 후에만 진행. 애매하면 선택지를 제시하고 **판단을 넘긴다**(특히 "둘 중 뭐가 잘못된 데이터냐"는 비즈니스 판단).

### ④ 실행 (트랜잭션 + 가드)
```python
async with conn.transaction():
    status = await conn.execute("UPDATE ... WHERE id=$1 AND <가드 조건>", ...)
    if status != 'UPDATE 1':      # 예상 행수 명시
        raise RuntimeError('예상과 다름 → 롤백')
```
- 가드 예: `AND contract_agency_id IS NULL`(이미 채워졌으면 덮지 않음), 삭제 전 대상 동일성 assert(type·금액·날짜).
- **한 번에 한 건**. 대량 작업은 별도 검토.

### ⑤ 사후 검증
변경된 행을 다시 조회해 기대값과 일치하는지 출력. 집계가 있으면 계약 조건과 대조(예: rent 스케줄 건수·합계 = `contract_long_term.total_months × monthly_amount`).

## 도메인 참고 (실제 처리 사례에서 확인된 것)

**에이전시 연결**
- 에이전시 = `company` (`industry='RENTAL'`). 계약 연결 = `contract.contract_agency_id`(UUID FK) + `delivery_type='agency'`.
- 완료(`completed`) 계약은 UI에서 에이전시 필드가 잠겨 DB 연결이 유일한 수단인 경우가 많다.
- 수수료 `invoice`는 **스냅샷**(`issued_to` 텍스트) — FK 연결해도 **청구액 재계산 없음**. 안전.
- 에이전시 계약 상당수가 `contract_agency_id IS NULL` (흔한 상태, 그 자체가 오류는 아님).

**청구 회차 중복**
- 중복 판정은 **`(billing_type, installment_no)`** 기준. `installment_no`만으로 묶으면 deposit·rent가 겹쳐 오탐.
- 정합성 기준: `billing_type='rent'` 건수·합계 == `contract_long_term.total_months` × `monthly_amount`.
- 생성 시각(`created_at`)이 유용한 단서 — 최초 일괄 생성분(전부 동일 timestamp)에서 **혼자 떨어져 나중에 생성된 행**이 이상치일 가능성이 높다.
- 스케줄 삭제 시 **`billing_schedule` + 연결된 `invoice` 둘 다** 지워야 청구가 실제로 사라진다(스케줄만 지우면 invoice가 고아로 남아 미수금에 계속 잡힘).

**invoice 를 참조하는 테이블 (삭제 전 전부 0건 확인)**
`payment`, `invoice_line_item`, `invoice_memo`, `penalty_payment`, `invoice_accident_detail`, `billing_schedule`

## Legacy 계약 백필 (2026 이전 계약)

CRM 도입 전 계약이라 **출고(delivery)·청구 스케줄이 없거나 최근 1~2회차만 백필**돼 있는 상태.
정상 UI가 막힌다(예: "인도일 기준 납부일 재설정"은 `delivery.delivered_at` 필수 —
`reschedule_rent`/`preview` 양쪽에 `NOT_DELIVERED` 가드가 있어 **매월 N일 방식으로도 우회 불가**).

**필요한 입력**: 고객명 · 계약체결일 · 인도일 · 월 금액 · 납부 이력(날짜 규칙: 언제부터 며칠) · 미납 시작 회차

### 절차
1. **현재 상태 조사** — `contract`(confirmed_at/start/end/assigned_to), `contract_long_term`(total_months·monthly·total),
   `delivery` 유무, 기존 `billing_schedule`+`invoice` 전체.
2. **회차 매핑** — 납부 이력으로 1..N 회차를 계산하고, **기존 백필 행(보통 최근 1~2회차)의 번호·날짜와 일치하는지 반드시 대조**.
   일치하면 매핑이 옳다는 강한 검증이다(실제 2건 모두 정확히 맞았다). 어긋나면 매핑을 다시 세운다.
3. **`total_months` 검증** — DB가 **61인데 `end_date`는 60개월과 맞는** 사례가 반복된다(실측 2/2건).
   사용자 확인 후 60으로 정정하고 `total_amount`(= months × monthly)도 함께 고친다.
4. **delivery 백필 전 실적 영향 점검 (필수)** — `effective_month` 1순위가 `delivered_at`이라
   그 달 **출고 실적·인센티브 집계에 추가**된다. 다음 4가지를 먼저 확인:
   - 계약의 `assigned_to` (미배정이면 귀속 대상 없음)
   - 그 달 담당자별 출고 건수
   - 인센티브 구간 경계 (1~14대 7% / 15~29대 8% / 30대~ 9%) — +1이 구간을 넘기는지
   - `employee_commission_settlement` 해당 년·월 기록 유무 (이미 정산됐으면 절대 건드리지 말 것)
   → 담당자 미배정 + 구간 불변 + 정산 0건이면 안전.
5. **기존 행 템플릿 복제** — 기존 `invoice`/`billing_schedule` 를 전체 컬럼으로 떠서 **같은 형태로** 생성한다
   (`title='월 렌트료 N회차'`, `vat=0`, `payer_type='customer'`, `issued_at=due_date`, `type='rent'` 등).
6. **완납 기록 방식은 계약 내 기존 행과 일치시킨다** — 이 프로젝트의 legacy 백필은 `payment` 행 없이
   `invoice.paid_amount/paid_at`만 세팅한다. 새로 `payment` 행을 만들면 기존 회차와 불일치하고,
   없는 수납 상세(방식·일자)를 지어내게 된다.
7. **추적 마커** — 신규 행 `metadata` 에 `{"source": "legacy_backfill_YYYYMMDD"}`.
8. **트랜잭션 일괄 + 검증** — rent 건수·합계 == `total_months × monthly_amount` 확인.

### 주의
- **`delivery` 는 DB에 직접 INSERT** 한다. 서비스 `deliver()` 를 호출하면 **청구 자동생성 트리거**가 돌아 중복 스케줄이 생긴다.
- 오늘이 기일인 회차는 `issued`(연체 아님). 기일이 지난 미납만 `overdue`.
- `start_date`/`end_date` 는 개월수와 정합하면 **굳이 안 건드린다**(최소 변경). `start_date`는 원래 인도일과 같아야 하지만, 이미 값이 있고 정합하면 유지.
- 백필로 delivery가 생기면 **이후 납부일 변경은 UI로 가능**해진다(이번 한 번만 DB 작업).

## 하지 말 것
- 조사 없이 사용자의 전제만 믿고 실행
- 승인 없이 프로덕션 쓰기
- 수납 있는 청구서 삭제
- 가드·트랜잭션 없는 raw DML
- 비밀번호를 명령어나 출력에 남기기
- "어느 쪽이 잘못된 데이터인가" 를 임의 판단 (금액이 바뀌면 사용자 결정 사항)
