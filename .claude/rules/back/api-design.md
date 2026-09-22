---
description: "REST API 설계 컨벤션 — 엔드포인트 네이밍, 응답/에러 형태, 에러 코드, 페이지네이션"
paths:
  - "**/*.controller.ts"
  - "**/*.service.ts"
  - "**/*.router.py"
  - "**/api/**"
---

# REST API Design Convention

> **이 규칙은 FastAPI, NestJS, Django 등 모든 백엔드 프레임워크에 적용되는 상위 기준이다.**
> 프레임워크별 rules(`fastapi.md`, `nest.md`, `django.md`)는 구현 방법만 다를 뿐,
> 응답 형태·에러 코드·페이지네이션은 반드시 이 파일을 따른다.

프레임워크(FastAPI, NestJS, Django)에 관계없이 모든 API에 동일하게 적용한다.

---

## 엔드포인트 네이밍

- 복수형 명사로 컬렉션 표현
- 행위는 HTTP 메서드로 표현 — URL에 동사 금지

```
✅ GET    /vehicles          목록
✅ GET    /vehicles/:id      단건
✅ POST   /vehicles          생성
✅ PATCH  /vehicles/:id      부분 수정
✅ DELETE /vehicles/:id      삭제

❌ GET  /getVehicles
❌ POST /vehicles/create
```

### 하위 리소스

```
GET  /leads/:id/sales-logs      영업일지 목록
POST /leads/:id/sales-logs      영업일지 등록
PUT  /sales-logs/:id            영업일지 수정
```

- 중첩은 2단까지. 그 이상은 쿼리 파라미터로 대체
- 정적 경로는 `:id` 파라미터 경로보다 **위에** 선언

```
✅ GET /vehicles/summary    (정적 → 먼저)
✅ GET /vehicles/:id        (동적 → 나중에)
```

---

## 응답 형태

### 단건

```json
{ "id": 1, "name": "아반떼", "status": "standby" }
```

### 목록 (페이지네이션 없음)

```json
[
  { "id": 1, "name": "아반떼" },
  { "id": 2, "name": "쏘나타" }
]
```

### 목록 (페이지네이션 있음) — PagedResponse

```json
{
  "items": [
    { "id": 1, "name": "아반떼" }
  ],
  "total": 87,
  "page": 1,
  "limit": 20,
  "total_pages": 5
}
```

`total_pages = ceil(total / limit)`

### Mutation 응답

| 메서드 | 상태코드 | 응답 바디 |
|--------|---------|---------|
| POST (생성) | 201 | 생성된 리소스 |
| PATCH / PUT (수정) | 200 | 수정된 리소스 |
| DELETE | 204 | 없음 |
| 비동기 액션 | 200 | `{ "ok": true }` |

---

## 페이지네이션

### 요청 파라미터

| 파라미터 | 기본값 | 설명 |
|---------|--------|------|
| `page` | 1 | 1부터 시작 |
| `limit` | 20 | 페이지당 항목 수 |

```
GET /inquiries?page=2&limit=20&status=new
```

### 규칙

- 필터 변경 시 `page=1` 로 초기화
- `limit` 최대값 제한 권장 (예: 100)
- 클라이언트에서 전체 로드 후 slice 금지 — 반드시 서버 사이드 페이지네이션

---

## 에러 형태

### 기본 구조

```json
{
  "code": "VEHICLE_NOT_FOUND",
  "message": "차량을 찾을 수 없어요"
}
```

| 필드 | 설명 |
|------|------|
| `code` | 기계가 읽는 에러 식별자 (UPPER_SNAKE_CASE) |
| `message` | 사용자에게 보여줄 한국어 메시지 |

### 유효성 검사 에러 (400)

필드별 에러가 있을 때 `errors` 배열 추가:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "입력값을 확인해 주세요",
  "errors": [
    { "field": "email", "message": "올바른 이메일 형식이 아니에요" },
    { "field": "phone", "message": "연락처를 입력해 주세요" }
  ]
}
```

---

## 에러 코드 표준

### HTTP 상태코드별 사용 기준

| 코드 | 용도 |
|------|------|
| 400 | 잘못된 입력값, 유효하지 않은 상태 전환 |
| 401 | 인증 없음 (로그인 필요) |
| 403 | 권한 없음 (로그인은 됐지만 접근 불가) |
| 404 | 리소스 없음 |
| 409 | 충돌 (중복, 이미 존재) |
| 422 | 요청 형식은 맞지만 비즈니스 규칙 위반 |
| 500 | 서버 내부 오류 |

### 도메인별 에러 코드 예시

```
# 공통
NOT_FOUND               리소스를 찾을 수 없음
VALIDATION_ERROR        입력값 오류
UNAUTHORIZED            로그인 필요
FORBIDDEN               권한 없음
INTERNAL_ERROR          서버 오류

# 인증
INVALID_CREDENTIALS     이메일/비밀번호 불일치
SESSION_EXPIRED         세션 만료
EMAIL_NOT_ALLOWED       허용되지 않은 이메일

# 리소스 충돌
DUPLICATE_EMAIL         이미 등록된 이메일
DUPLICATE_PLATE         이미 등록된 번호판

# 상태 전환
INVALID_STATUS_TRANSITION   허용되지 않은 상태 전환
ALREADY_CONVERTED           이미 전환된 리소스

# 비즈니스 규칙
VEHICLE_ALREADY_MATCHED     이미 매칭된 차량
ASSIGNEE_REQUIRED           담당자 배정 필요
```

새 에러 코드는 `DOMAIN_REASON` 패턴으로 추가: `LEAD_ALREADY_CONTRACTED`, `DOC_REVIEW_PENDING` 등

---

## 쿼리 파라미터 컨벤션

| 용도 | 파라미터 | 예시 |
|------|----------|------|
| 검색 | `search` | `?search=홍길동` |
| 상태 필터 | `status` | `?status=active` |
| ID 필터 | `{resource}_id` | `?lead_id=3` |
| 정렬 | `sort` | `?sort=created_at` |
| 정렬 방향 | `order` | `?order=desc` |
| 날짜 범위 | `from`, `to` | `?from=2024-01-01&to=2024-12-31` |
| 페이지네이션 | `page`, `limit` | `?page=1&limit=20` |

---

## 원칙

- `message`는 항상 **사용자에게 보여줄 수 있는 한국어** 로 작성
- 내부 정보 (스택 트레이스, DB 쿼리, 파일 경로) 응답에 절대 포함 금지
- `code`는 FE에서 특정 에러를 구분해 처리할 때 사용 (토스트 문구 교체, 모달 분기 등)
- 500 에러는 `INTERNAL_ERROR` + "잠시 후 다시 시도해 주세요" 고정, 상세 내용은 서버 로그에만

---

## 버전 관리

- 단일 버전 운영이면 prefix 불필요
- Breaking change 시 `/v2/` prefix 도입 검토
