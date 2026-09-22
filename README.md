# Kaisa Training Records Platform

교육훈련 이력 관리 및 수료 확인서 발급 플랫폼. 회원 포털(web) + 관리자 콘솔(admin) + 백엔드 API 가 한 모노레포에 있다. `gongcar-apps` 구조를 참고해 스캐폴드.

## 모노레포 구조

```
kaisa-training-records-platform/
├── frontend/
│   ├── apps/
│   │   ├── web/            # 회원 포털 — React + Vite SPA (FSD), port 3000
│   │   └── admin/          # 관리자 콘솔 — React + Vite SPA (FSD), port 5173
│   └── packages/           # 공유 패키지 (workspace) — ui, api, assets, eslint/ts config
├── backend/
│   └── api/                # FastAPI + SQLAlchemy(async) + Alembic (uv)
├── docs/                   # 문서 — backend / web / admin 으로 분리
└── .github/workflows/      # CI (alembic single-head) · CD (태그 기반 배포)
```

## 스택 한눈에

| 영역 | 기술 |
|------|------|
| **Frontend** | React · Vite · React Router · TanStack Query · Zustand · Tailwind v4 · pnpm (turbo) |
| **Backend** | FastAPI · SQLAlchemy 2.0 (async) · Alembic · Pydantic v2 · uv |
| **DB** | PostgreSQL (asyncpg) — 로컬·스테이징·프로덕션 동일 |
| **외부 연동** | PortOne — PASS 본인인증 + 결제 |
| **Infra** | EC2 + docker compose (api + postgres + nginx) · AWS Secrets Manager |
| **CI/CD** | GitHub Actions (태그 트리거 `be-staging-v*` / `be-prod-v*`) |

## 빠른 시작 (로컬)

### 백엔드

전제: 로컬 PostgreSQL 에 `kaisa` role + DB 가 있어야 한다.

```bash
cd backend/api
cp .env.example .env

# 최초 1회 — 테스트용 kaisa_test DB도 생성
psql -h localhost -U kaisa -d postgres -c "CREATE DATABASE kaisa_test OWNER kaisa;"

make install          # uv sync
make migrate          # alembic upgrade head
make dev              # http://localhost:8000
```

- API 문서(Scalar): http://localhost:8000/scalar
- 헬스체크: http://localhost:8000/api/health
- 자세한 구조·테스트·보안: [backend/api/README.md](backend/api/README.md)

### 프론트엔드

```bash
cd frontend
pnpm install
pnpm dev                    # web + admin 동시
pnpm --filter web dev       # web 만 (http://localhost:3000)
pnpm --filter admin dev     # admin 만 (http://localhost:5173)
```

## 문서

| 위치 | 내용 |
|------|------|
| [docs/backend/](docs/backend/README.md) | 백엔드 구축 계획·검증, 배포 계획, DB 스키마·ERD |
| [docs/web/api.md](docs/web/api.md) | 회원 포털 API — 엔드포인트 + entities API 작성 가이드 |
| [docs/admin/api.md](docs/admin/api.md) | 관리자 콘솔 API — 엔드포인트 + entities API 작성 가이드 |
| [docs/admin/frontend-plan.md](docs/admin/frontend-plan.md) | 어드민 화면 설계 (IA·FSD 구조·단계 계획) |
| [.claude/rules/](.claude/rules/) | 프로젝트 룰 (백엔드/프론트/공통) |

## 배포

스테이징·프로덕션 모두 **EC2 + docker compose 동일 구조** (api + postgres + nginx).

```bash
git tag be-staging-v0.1.0
git push origin be-staging-v0.1.0      # GitHub Actions → EC2 SSH → compose up + alembic
```

- 시크릿은 AWS Secrets Manager(`kaisa-staging` / `kaisa-prod`)에서 인스턴스 롤로 로드 — `.env` 없음.
- 배포 전제 작업(도메인·EC2·시크릿 등 AWS 수동 설정)은 [docs/backend/backend-deployment.md](docs/backend/backend-deployment.md) Phase B~D 참고.

## 자주 쓰는 명령어

```bash
# Backend
cd backend/api
make dev                        # 개발 서버
make test                       # pytest (단위 + 통합)
make lint && make fmt           # ruff check + format
make migration name="..."       # alembic revision --autogenerate
make migrate                    # alembic upgrade head

# Frontend
cd frontend
pnpm dev                        # 개발 서버 (web + admin)
pnpm --filter web build         # 빌드
```

## 커밋 커밴션

모노레포이므로 `type(layer/scope): description` 형식.

```
feat(be/certificate): 확인서 재발급 supersede 처리 추가
feat(fe/admin): 교육이력 등록 모달 추가
fix(be/auth): 세션 쿠키 옵션 수정
chore(ci): 배포 워크플로우 추가
```

자세한 규칙: [.claude/rules/project/git-commit.md](.claude/rules/project/git-commit.md)
