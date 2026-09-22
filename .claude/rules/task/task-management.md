# Task Management (ClickUp)

프로젝트의 개발 태스크를 ClickUp에서 관리하는 방법과 규칙.

## 작업 시작 전 필수: 피처 현황 조회

특정 피처 작업을 시작하기 전에 **반드시** 현재 ClickUp 상태를 먼저 확인한다.
팀원이 이미 작업 중이거나, 담당자가 배정되어 있거나, 스펙이 변경되었을 수 있음.

```bash
python3 tasks/fetch.py [피처명]
# 예: python3 tasks/fetch.py vehicle
```

확인 포인트:
- **담당자**: 이미 누군가 배정되어 있으면 중복 작업 주의
- **상태**: `in progress`면 진행 중인 작업 있음
- **DoD**: 이미 완료된 항목 확인 후 작업 범위 결정
- **구현 상태**: ✅/⚠️/🔲로 현재 완성도 파악

## 태스크 계층 구조

```
Epic (마일스톤)                      예: "CRM Phase 1"
└── Feature (기능)                   예: "차량 관리", "팀원 관리"
    ├── [BE] GET /vehicles — 목록 조회
    ├── [BE] POST /vehicles — 차량 등록
    ├── [BE] PATCH /vehicles/:id — 수정·상태변경
    ├── [FE] 차량 목록 · 상태탭 · 검색
    ├── [FE] 차량 등록·수정 모달
    └── [Integration] 차량 관리 실 API 연동
```

- **Epic**: 마일스톤 또는 릴리즈 단위
- **Feature**: 독립적인 기능 단위 (도메인 레벨)
- **서브태스크**: **엔드포인트 또는 화면 단위**로 분할. 아래 접두사 규칙 준수

### 서브태스크 접두사 규칙

| 접두사 | 대상 | 이름 형식 |
|--------|------|----------|
| `[BE]` | 백엔드 엔드포인트 | `[BE] METHOD /path — 한 줄 설명` |
| `[FE]` | 프론트엔드 화면/컴포넌트 | `[FE] 화면명 · 기능명` |
| `[Integration]` | 실 API 연동 (MSW → 실서버 전환) | `[Integration] 도메인명 실 API 연동` |

```
✅ 올바른 이름
[BE] GET /vehicles — 목록 조회
[BE] POST /vehicles/:id/maintenance-logs — 정비 이력 등록
[FE] 차량 목록 · 상태탭 · 검색
[FE] 차량 등록·수정 모달
[Integration] 차량 관리 실 API 연동

❌ 이전 방식 (사용 금지)
[Backend] 차량 CRUD · 상태 변경 API
[Frontend] 차량 목록 · 상태탭 · 검색 필터
```

## 태스크 분할 기준

### Feature 분할 (언제 별도 Feature로 분리하는가)

```
✅ 별도 Feature
- 서로 다른 도메인 엔티티 (예: 문의 ≠ 장기렌트 리드)
- 각각 독립적으로 배포 가능한 경우

✅ 하나의 Feature로 묶기
- 같은 도메인 엔티티의 CRUD 전체
- 관련 엔드포인트가 10개 이내
```

### 서브태스크 분할 기준

```
[BE] 분할 기준
- 엔드포인트 1개 = 태스크 1개 (원칙)
- GET/POST를 같은 경로에서 모두 처리하면 하나로 묶을 수 있음
  예: [BE] GET/POST /vehicles/:id/maintenance-logs — 정비 이력

[FE] 분할 기준
- 화면(페이지/드로어/모달) 단위로 묶기
- 독립적으로 개발 가능한 UI 블록 기준 분리

[Integration]
- Feature당 1개 (백엔드 + MSW 완료 후 실 API 전환 작업)
```

### 소규모 팀 기준 적정 태스크 크기

| 구분 | 적정 크기 |
|------|----------|
| Feature | 도메인 엔티티 단위 |
| `[BE]` 서브태스크 | 엔드포인트 1~2개, 0.5~1일 |
| `[FE]` 서브태스크 | 화면 1개, 1~2일 |
| `[Integration]` | Feature당 1개 |

## 태스크 내용 템플릿

### [BE] 태스크

```markdown
## 현재 구현 상태
✅ 완료 / ⚠️ 부분 구현 / 🔲 미착수

## 데이터 모델
> 도메인 첫 번째 [BE] 태스크에 작성. 이후 태스크에서는 생략 가능.

**`테이블명`**
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | int PK | |
| field | varchar(100) | |
| status | varchar(20) | unpaid \| billed \| paid |
| fk_id | int FK → other.id | |
| created_at | datetime | |

## Query Params (GET인 경우)
- `status`: 필터 가능한 값
- `search`: 검색 기준 필드

## Request (POST/PATCH인 경우)
\```json
{ "field": "value" }
\```

## Response
\```json
{ "id": 1, "field": "value" }
\```

## 비즈니스 로직
- 상태 전환 규칙 (예: unpaid → billed → paid 순서 강제)
- 자동 트리거 (예: 계약확정 시 입금 스케줄 자동 생성)
- 권한 제한 (예: 어드민만 수정 가능)

## DoD
- [ ] 정상 응답 반환
- [ ] 에러 케이스 처리 (404 / 409 등)
- [ ] 비즈니스 로직 동작
```

### [FE] 태스크

```markdown
## 현재 구현 상태
✅ 완료 / ⚠️ 부분 구현 / 🔲 미착수

## 화면
- [x] 완료된 UI 요소
- [ ] 미완료 UI 요소
- [ ] MSW 핸들러 연결

## 관련 파일
- `src/views/feature-name/ui/feature-page.tsx`

## DoD
- [ ] UI 정상 렌더링
- [ ] MSW 핸들러 연결 → 데이터 표시
- [ ] 에러 상태 처리
```

### [Integration] 태스크

```markdown
## 현재 구현 상태
🔲 미착수

## 선행 조건
백엔드 [BE] 태스크 전체 + MSW 핸들러 구현 후 시작.

## 체크리스트
- [ ] 백엔드 [BE] 태스크 전체 완료 확인
- [ ] MSW handlers/feature.ts 작성
- [ ] 프론트 타입 백엔드 응답 구조에 맞게 확인
- [ ] 실 API 연동 후 handlers/feature.ts 제거

## DoD
- [ ] 목록/상세 실 API 동작
- [ ] 등록·수정·삭제 실 API 동작
- [ ] MSW 핸들러 제거
```

## 현재 구현 상태 표기

| 이모지 | 의미 |
|--------|------|
| ✅ | 완료 |
| ⚠️ | 부분 구현 (일부 완료) |
| 🔲 | 미착수 |

## DoD 체크리스트 작성 원칙

완료 여부를 외부에서 확인할 수 있는 기준만 작성.

```
❌ "기능이 동작한다"
✅ "계약확정 상태 변경 시 입금 스케줄 자동 생성 확인"

❌ "에러 처리"
✅ "중복 이메일 등록 시 409 응답 반환"
```

- Frontend DoD: UI 렌더링 + 데이터 연동 + 에러 처리
- Backend DoD: 엔드포인트 응답 + 비즈니스 로직 + 에러 케이스

---

## ClickUp API로 태스크 동기화

태스크는 `tasks/` 폴더의 Python 스크립트로 관리한다.
**ID 기반 upsert** 전략 — `task_ids.json`에 저장된 ClickUp ID로 직접 업데이트.

### 폴더 구조

```
tasks/
├── run.py                  # 진입점 — 전체 동기화 실행
├── api.py                  # ClickUp API 함수 (sync_feature)
├── task_ids.json           # {parent_id: {task_name: clickup_id}} — 자동 관리
├── features/
│   ├── __init__.py         # ALL_FEATURES 리스트
│   ├── vehicle/            # 도메인별 패키지
│   │   ├── __init__.py     # PARENT_ID, PARENT_NAME, TASKS 조립
│   │   ├── be.py           # [BE] 태스크 목록
│   │   ├── fe.py           # [FE] 태스크 목록
│   │   └── integration.py  # [Integration] 태스크 목록
│   ├── login/
│   └── ...
└── fetch.py                # 특정 피처 현황 조회
```

### 피처 패키지 구조

**`tasks/features/vehicle/__init__.py`**
```python
PARENT_ID = "ClickUp_태스크ID"
PARENT_NAME = "차량 관리"

from .be import TASKS as BE_TASKS
from .fe import TASKS as FE_TASKS
from .integration import TASKS as INTEGRATION_TASKS

TASKS = BE_TASKS + FE_TASKS + INTEGRATION_TASKS
```

**`tasks/features/vehicle/be.py`**
```python
TASKS = [
    {
        "name": "[BE] GET /vehicles — 목록 조회",
        "description": """## 현재 구현 상태
✅ 완료

## Query Params
- `status`: available | rented | maintenance

## DoD
- [x] 목록 반환
- [x] 상태 필터 동작""",
    },
    {
        "name": "[BE] POST /vehicles — 차량 등록",
        "description": """## 현재 구현 상태
🔲 미착수

## Request
\```json
{ "plate_no": "12가3456", "maker_id": 1 }
\```

## DoD
- [ ] 차량 등록 동작
- [ ] 중복 번호판 409""",
    },
]
```

**`tasks/features/vehicle/fe.py`**
```python
TASKS = [
    {
        "name": "[FE] 차량 목록 · 상태탭 · 검색",
        "description": """...""",
    },
]
```

### task_ids.json — 핵심 메커니즘

첫 sync 실행 시 ClickUp의 현재 태스크 ID를 자동으로 수집해 저장한다.
이후 모든 업데이트는 이름 대신 ID로 직접 처리 → 이름이 바뀌어도 중복 생성 없음.

```json
{
  "86excmkvw": {
    "[BE] GET /vehicles — 목록 조회": "abc123def",
    "[FE] 차량 목록 · 상태탭 · 검색": "xyz789"
  }
}
```

- **자동 관리**: `run.py` 실행 시 항상 최신화됨
- **커밋 대상**: `.gitignore`에 추가하지 말 것 — ID를 팀원과 공유해야 함
- **직접 수정 금지**: `run.py`가 관리하므로 손으로 편집하지 않음

### 태스크 이름 변경 (`was` 필드)

이름을 바꿀 때 `was` 필드를 한 줄 추가한다. sync가 실행되면 기존 ID로 이름을 변경하고
`task_ids.json`의 키도 자동으로 교체된다. sync 완료 후 `was` 필드는 제거해도 된다.

```python
{
    "name": "[BE] GET /vehicles/summary — 상태별 집계",  # 새 이름
    "was":  "[BE] GET /vehicles — 목록 조회",            # 구 이름 (sync 후 제거 가능)
    "description": "...",
}
```

### 동기화 실행

```bash
python3 tasks/run.py
```

동기화 전략:
- `task_ids.json`에 ID 있음 → ID로 description 업데이트 (상태·담당자 보존)
- `was` 필드로 구 이름 ID 발견 → ID로 이름 + description 변경
- ID 없음 + ClickUp에도 없음 → 신규 생성 후 ID 저장
- 코드에서 사라진 태스크 → 경고만, 건드리지 않음 (ClickUp에서 직접 삭제)

### 새 Feature 추가 시

1. `tasks/features/새피처/` 폴더 생성
2. `__init__.py`, `be.py`, `fe.py`, `integration.py` 작성
3. ClickUp에서 Feature 부모 태스크 ID 확인 (`PARENT_ID`)
4. `tasks/features/__init__.py`의 `ALL_FEATURES`에 추가
5. `python3 tasks/run.py` 실행 → 자동 생성 + ID 저장

### 부모 태스크 ID 찾는 법

```bash
# ClickUp URL에서 직접 확인
# https://app.clickup.com/t/{team_id}/{task_id}  ← task_id 가 PARENT_ID
```

### API 토큰 관리

- 토큰은 `ref/clickup-api.md` 에 저장
- `tasks/api.py` 의 `TOKEN` 변수에 직접 설정 (로컬 전용 스크립트)

```
ref/clickup-api.md
  ClickUp Private Key : pk_...
```

---

## 소규모 팀에서 생략해도 되는 것

지금 당장 필요 없지만 팀이 커지면 추가:

| 요소 | 추가 시점 |
|------|----------|
| 담당자(Assignee) | 같은 기능을 여러 명이 나눠 할 때 |
| 우선순위(Priority) | 태스크가 50개 넘어갈 때 |
| 예상 공수(Story Points) | 스프린트 계획이 필요할 때 |
| 의존성(Dependencies) | BE 완료 전 FE 시작 불가 관계가 생길 때 |
| 스프린트 | 2주 단위 배포 관리할 때 |
