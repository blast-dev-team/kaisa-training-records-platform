# DB 설계 규칙

이 프로젝트는 장기렌트 CRM으로, 계약·입금·납부 스케줄 등 금융성 데이터를 다룬다.
DB 설계 실수가 실운영 데이터 오염으로 직결되므로 아래 규칙을 엄격히 따른다.

## 스키마 문서 위치

| 파일 | 역할 |
|------|------|
| `docs/db-schema.md` | 전체 테이블 정의서 (컬럼·타입·설명) |
| `docs/db-diagram.dbml` | dbdiagram.io ER 다이어그램 **작업본** (origin + 로컬 변경분) |
| `docs/db-diagram-origin.dbml` | dbdiagram.io 에서 받은 마지막 스냅샷 — **직접 수정 금지** |

**모델 변경 시 `db-schema.md` + `db-diagram.dbml` 두 파일을 반드시 함께 업데이트한다.**

### dbdiagram.io 협업 워크플로우

dbdiagram.io 는 팀이 함께 쓰는 외부 도구다. `git`의 origin 과 같은 개념으로 다룬다.

```
db-diagram-origin.dbml   ← dbdiagram.io 에서 받은 스냅샷 (upstream, read-only)
db-diagram.dbml          ← 작업본. origin + 로컬 변경분. 여기에만 편집한다.
```

- **`-origin.dbml` 은 절대 손대지 않는다.** 누군가 dbdiagram.io 에서 새로 export 해서
  교체할 때만 갱신된다. diff 기준점이므로 보존한다.
- 스키마 변경은 항상 `db-diagram.dbml` 에 한다. 이 파일이 dbdiagram.io 에 붙여넣어 푸시하는 대상이다.
- `db-diagram.dbml` 은 **항상 전체 스키마**를 담는다. 한 도메인만 담으면 dbdiagram.io 에
  붙여넣을 때 다른 도메인이 사라진다. 도메인 일부만 바꿔도 전체 파일을 유지한 채 해당 부분만 수정한다.
- dbdiagram.io 푸시 후 팀이 확인하면, 최신본을 다시 export 받아 `-origin.dbml` 을 교체하고
  `db-diagram.dbml` 과의 diff 가 0 이 되도록 맞춘다.
- 다른 사람이 origin 을 갱신했을 수 있으므로, dbml 작업 전 `git pull` 로 두 파일을 최신화한다.

## 모델 변경 전 체크리스트

모델 파일(`model/*.py`) 또는 마이그레이션을 건드리기 전에 반드시:

1. `docs/db-schema.md` 를 먼저 읽고 현재 스키마 파악
2. 변경이 기존 데이터에 미치는 영향 명시 (신규 컬럼인지, 타입 변경인지, 관계 변경인지)
3. 영향 범위가 2개 테이블 이상이면 구현 전에 사용자에게 확인

## 비즈니스 로직 트리거 규칙

이 프로젝트는 특정 상태 전환 시 다른 테이블에 데이터를 자동 생성하는 연쇄 로직이 있다.
변경 전 반드시 트리거 맵을 확인한다.

### 현재 확정된 트리거 맵 (v1.35 / 2026-06-02)

> 청구 스케줄은 단일 테이블 **`billing_schedule`** + **`invoice`** 로 통합됨.
> 폐기: `payment_schedule`, `deposit_payment_schedule`, `advance_payment_schedule`, `commission_payment_schedule`.

| 트리거 이벤트 | 연쇄 생성/변경 |
|-------------|--------------|
| 계약 전환 (리드 → 계약) | `contract` 생성 (`status='new'`). `lead.status → contracted`. 금액·차량·일정 partial 허용 |
| 계약 확정 — 직영 (`confirm_contract`, `delivery_type='direct'`) | `contract.status → completed`. `confirmed_at` 기록. **받은 돈만 생성**: 보증금=`issued`(필수, 100만 분납) + 월렌트료 1회차 선납=`issued`(옵션). **미래 월렌트료 스케줄 미생성** |
| 계약 확정 — 에이전시 (`confirm_contract`, `delivery_type='agency'`) | `contract.status → completed`. `confirmed_at` 기록. **수수료 `billing_schedule`+`invoice(미발행/draft)` 생성** (금액=율×총렌트료 자동, due_at=null). 보증금·월렌트료는 공카 미생성 |
| 출고완료 — 직영 (`delivery.deliver`) | `contract.start_date = delivered_at`, `end_date` 재계산. **월렌트료 N회차 자동 계산 → 영업 검토 모달(§8B) → 확정 시 `billing_schedule`+`invoice(issued)` 생성** (선납 1회차 있으면 2~N). 미래분도 issued지만 미수금=연체라 무방 |
| 출고완료 — 에이전시 (`delivery.deliver`) | `contract.start_date = delivered_at`, `end_date` 재계산. **확정 때 만든 수수료(미발행) 불러와 영업 확인·조정 → `due_at` 세팅 + 발행(draft→issued)** |
| 이탈 처리 (`churn_contract`) | `contract.status → churned`. 차량 점유 해제(→ standby), 남은 스케줄 cancelled, 연결 `lead.status → lost` |
| 차량 등록 (`attach_vehicle`) | `vehicle` 신규 생성 + `contract.vehicle_id` 연결 (간이 등록 — `license_plate` 나중에 채움 허용) |

> **청구 생성 모델 (v1.35):**
> - **확정**: 직영=보증금(issued)+선납 1회차(issued→즉시 paid). 에이전시=수수료를 **미발행(draft)** 으로 생성(금액=율×총렌트료 자동). 직영 미래 월렌트료는 미생성.
> - **출고완료**: 영업 검토 모달(§8B) — 직영 월렌트료 N회차 신규 생성(issued) / 에이전시 수수료 발행(draft→issued)+due_at. 영업이 확인·조정.
> - **미수금 = 연체(due 지난 미납)** 정의라 미래 issued·확정기 draft 는 미수금에 안 잡힘 → D-7 발행 cron 불필요(overdue cron만).
> - 인도일을 아는 시점에 확정하므로 cascade 없음.
> 결정 맥락: [docs/crm/prd/payment-management.md](../../../docs/crm/prd/payment-management.md) v1.35 §4·§8B,
> [feedback.md](../../../docs/crm/prd/feedback.md) #26.
> 탁송·인도 자체는 별도 도메인(`delivery`, [delivery-status.md](../../../docs/crm/prd/delivery-status.md)) 에서 추적한다.

## 비정규화(캐시) 컬럼 금지

다른 테이블의 값을 복제해 저장하는 캐시 컬럼은 만들지 않는다.
원본이 바뀌면 동기화가 깨져 stale data 문제가 발생한다.

### ❌ 금지 패턴 (과거 잔재, 모두 제거됨)

| 잘못된 컬럼 | 원본 |
|------------|------|
| `inquiry.assignee_name` → `inquiry.assignee_id` FK + relationship |
| `lead.assigned_name`   → `lead.assigned_to`  FK + relationship |
| `contract.assigned_name` → `contract.assigned_to` FK + relationship |
| `user.department_name` → `user.department_id` FK + relationship |

### ✅ 올바른 패턴

```python
# 모델: FK + relationship (lazy="joined" 로 단건 join)
assignee_id: Mapped[int | None] = mapped_column(
    Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True
)
assignee: Mapped["User | None"] = relationship("User", lazy="joined")

# Response 스키마: from_orm 에서 동적 추출
@classmethod
def from_orm(cls, obj) -> "XxxResponse":
    return cls(
        ...,
        assignee_name=obj.assignee.name if obj.assignee else None,
    )
```

### 예외 — 스냅샷 컬럼 (유지)

"입력 당시 값"을 의도적으로 보존하는 컬럼은 캐시가 아니라 독립 데이터다.

| 컬럼 | 보존 이유 |
|------|----------|
| `pre_contract.customer_name` | 계약 서명 시점 이름 (법적 기록, 불변) |
| `inquiry.customer_name` | 문의 접수 시점 입력값 (이후 customer 마스터와 다를 수 있음) |
| `lead.customer_name` | 리드 등록 시점 입력값 |
| `delivery_info.driver_name`, `driver_phone` | 배달 기사 일회성 정보 (참조 대상 테이블 없음) |

### 판단 기준

- 다른 테이블의 **현재 값을 보여줘야** 한다 → FK + relationship (캐시 금지)
- 그 **시점의 값을 보존해야** 한다 → 독립 컬럼 유지

새 컬럼 추가 시 위 기준으로 분류하고, 캐시면 만들지 말 것.

## 금융 데이터 필드 규칙

금액·회차·날짜 관련 필드는 아래 규칙을 따른다.

- **금액**: `Integer` 사용 (float 반올림 오류 방지). 단위: 원
- **날짜**: 신규 날짜 컬럼은 네이티브 `Date`(시각 필요 시 `DateTime(tz=True)`)를 기본으로 한다.
  DB 레벨 타입 검증·정렬·연산 안전을 확보하기 위함. 코드 경계에서 `datetime`/`str`을 섞어 넣어
  발생하던 타입 오류(예: `payment.paid_at` 500 버그)를 막는다.
  기존 `String(20)`(`YYYY-MM-DD`) 날짜 컬럼은 **레거시**로, 만지는 김에 점진 전환하되
  일괄 마이그레이션은 별도 결정. (`payment.paid_at` → `Date` 전환 완료 — 2026-06-04)
- **시간대**: 값을 넣을 때는 **항상 tz-aware(KST)**. naive 를 timestamptz 에 넣으면
  실행 환경의 OS 타임존으로 해석돼 로컬(KST)과 컨테이너(UTC)가 9시간 어긋난다.
  `app/core/kst.py` 의 `now_kst` / `today_kst` / `ensure_kst` 를 쓴다 → [timezone.md](timezone.md)
- **상태**: Enum 문자열로 관리. `model/enums.py`에 정의 후 재사용
- **NULL 허용 기준**: 나중에 채워질 값은 nullable. 생성 시점에 반드시 있어야 할 값은 not null

## Alembic 마이그레이션 규칙

- 컬럼 추가: `nullable=True` 또는 `server_default` 필수 (기존 row 호환)
- 컬럼 삭제: 먼저 코드에서 참조 제거 → 다음 배포에서 컬럼 삭제
- 타입 변경: 절대 직접 변경 금지. 신규 컬럼 추가 → 데이터 마이그레이션 → 구 컬럼 삭제 순서
- PostgreSQL 단일 타깃: dialect 전용 타입(ARRAY, JSONB, UUID 등) 사용 가능

## 새 도메인 추가 시 순서

```
1. docs/db-schema.md 에 테이블 정의 초안 작성
2. docs/db-diagram.dbml 에 DBML 추가 → dbdiagram.io 에서 관계 시각화 확인
3. 사용자 확인 후 model/*.py 구현
4. Alembic 마이그레이션 생성
5. docs/db-schema.md, db-diagram.dbml 최종 업데이트
```

구현보다 설계 문서가 먼저다.

---

## [임시] 스키마 변경 승인 게이트

> 임시 규칙 — 백엔드 담당자가 정해지면 재검토.
> 현재 사용자가 백엔드 비전문가라 스키마 변경의 파급을 직접 판단하기 어렵다.
> 변경 전 이유를 듣고 결정하기 위한 게이트.

`db-diagram-origin.dbml` 은 현재 스키마 설계의 **기준(source of truth)** 이다.
이 기준에서 벗어나는 스키마 변경은 코드를 고치기 전에 반드시:

1. 변경 대상과 범위를 명시한다
2. **왜 필요한지 이유를 먼저 설명한다**
3. 사용자 승인을 받은 뒤 진행한다

특히 **테이블/컬럼 제거, enum 값 제거, 관계 변경** 은 파급이 크므로
"최대한 하지 않는다"를 기본값으로 두고, 불가피할 때만 위 절차를 거친다.

### 승인이 필요한 변경

- 테이블 추가 / 제거
- 컬럼 추가 / 제거 / 타입 변경
- enum 값 추가 / 제거
- FK · 관계 변경

### 승인 없이 가능

- origin.dbml 과 코드가 이미 일치하는 부분의 단순 수정
- 비스키마 코드 (서비스 · 라우터 · 프론트 로직)
- 설계 문서(`db-schema.md`, `db-diagram.dbml`) 작성 — 오히려 권장
