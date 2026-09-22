# 프로젝트 스택

## 프론트엔드

- **프레임워크**: React + Vite (SPA)
- **라우팅**: React Router v7
- **상태 관리**: TanStack Query (서버) + Zustand (클라이언트)
- **스타일**: Tailwind CSS v4
- **패키지 매니저**: pnpm

→ `front/` 룰 전체 적용. `back/nest.md` 무시.

## 백엔드

- **프레임워크**: FastAPI (Python)
- **ORM**: SQLAlchemy 2.0 (async)
- **마이그레이션**: Alembic
- **패키지 매니저**: uv
- **API 문서**: Scalar

→ `back/fastapi.md` 적용. `back/nest.md`, `back/django.md` 무시.

## 데이터베이스

| 환경 | DB | 드라이버 |
|------|----|---------|
| 로컬 | PostgreSQL (brew/Postgres.app) | asyncpg |
| 스테이징 / 프로덕션 | PostgreSQL (docker-compose / RDS) | asyncpg |

`DATABASE_URL` 환경변수만 다르고 애플리케이션 코드·마이그레이션은 동일.
PostgreSQL 단일 타깃이므로 `ARRAY`, `JSONB`, `UUID` 등 dialect 전용 타입도 자유롭게 사용 가능.

### 로컬 초기 세팅

```bash
brew install postgresql@16 && brew services start postgresql@16
psql -d postgres -c "CREATE ROLE gongcar WITH LOGIN PASSWORD 'gongcar' CREATEDB;"
psql -d postgres -c "CREATE DATABASE gongcar OWNER gongcar;"
cd backend/api && uv run alembic upgrade head
```

`DATABASE_URL=postgresql+asyncpg://gongcar:gongcar@localhost:5432/gongcar`

DB 초기화는 `make reset` (DROP + CREATE + 마이그레이션 재적용).

## 프로젝트 구조

```
gongcar-apps/
├── frontend/
│   └── apps/crm-fe/     # CRM 프론트엔드
├── backend/
│   └── api/             # FastAPI 백엔드
└── tasks/               # ClickUp 태스크 생성 스크립트
```

## 현재 구현된 백엔드 도메인

```
app/domain/
├── auth/        ✅ 로그인 (이메일/비밀번호 + Google OAuth)
├── user/        ✅ 유저 관리
├── company/     ✅ 회사 관리
├── inquiry/     ✅ 문의 관리
├── vehicle/     ✅ 차량 관리 (정비이력, 사고이력 포함)
├── lead/        ✅ 리드 관리 (영업로그, 사전계약, 서류, 배달정보 포함)
│                   계약확정 시 → contract 자동 생성 로직 포함
├── contract/    ✅ 장기 계약 + 입금 스케줄 (PaymentPlan, PaymentItem, Deposit, OtherItem)
│                   부분수납(partial) 상태, 기타 청구 항목 포함
├── customer/    ✅ 고객 관리 (메모 포함)
├── department/  ✅ 부서 관리
├── maker/       ✅ 제조사/모델 마스터
├── option/      ✅ 차량 옵션 마스터
├── settings/    ✅ 허용 이메일 관리
├── stats/       ✅ 집계 카운트
└── health/      ✅ 헬스체크
```

## 프론트엔드 ↔ 백엔드 연동 현황

> MSW 없음. 모든 도메인 실 API 직접 호출.

| 도메인 | 백엔드 | 프론트 뷰 | 실 API 연동 | 비고 |
|--------|--------|----------|------------|------|
| 인증 | ✅ | ✅ | ✅ | |
| 문의 | ✅ | ✅ | ✅ | |
| 차량 | ✅ | ✅ | ✅ | |
| 리드 (장기렌트) | ✅ | ✅ | ✅ | 계약확정→입금관리 자동생성 포함 |
| 입금/계약 | ✅ | ✅ | ✅ | 부분수납·기타청구항목 포함 |
| 고객 | ✅ | ✅ | ✅ | |
| 부서 | ✅ | ✅ (admin) | ✅ | |
| 제조사/모델 | ✅ | ✅ | ✅ | |
| 옵션 마스터 | ✅ | ✅ | ✅ | |
| stats | ✅ | ✅ (dashboard) | ✅ | |
