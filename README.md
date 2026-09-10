# Kaisa Training Records Platform

모노레포

```
backend/
  api/          # FastAPI + SQLAlchemy(async) + Alembic (uv)  → backend/api/README.md
frontend/
  apps/
    web/        # Vite + React SPA (FSD)             — port 3000
    admin/      # Vite + React SPA (FSD)             — port 5173
  packages/
    ui/                 # 공유 React 컴포넌트 (@repo/ui)
    api/                # OpenAPI 생성 API 클라이언트 (@repo/api)
    assets/             # 공유 정적 에셋 (@repo/assets)
    eslint-config/      # 공유 ESLint 설정
    typescript-config/  # 공유 tsconfig
.claude/        # Claude Code 규칙·스킬·설정
```

## 빠른 시작

### 백엔드

```bash
cd backend/api
cp .env.example .env
make install && make migrate && make dev   # http://localhost:8000
```

### 프론트엔드

```bash
cd frontend
pnpm install
pnpm dev                    # web + admin 동시
pnpm --filter web dev       # web 만 (http://localhost:3000)
pnpm --filter admin dev     # admin 만 (http://localhost:5173)
```

## 아키텍처

- 프론트엔드는 **FSD(Feature-Sliced Design)**: `app → views → widget → features → entities → shared`
- 스타일링은 **Tailwind CSS v4**
- 백엔드는 도메인별 모듈 구조 (`app/domain/<name>/{router,model,schema,service}.py`)
