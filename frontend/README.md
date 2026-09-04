# Kaisa Frontend

Turborepo + pnpm 모노레포.

## 구성

```
apps/
  web/      # Next.js 15 (App Router + FSD) — 사용자 웹 (port 3000)
  admin/    # Vite + React SPA (FSD) — 관리자 (port 5173)
packages/
  ui/                 # 공유 React 컴포넌트 (@repo/ui)
  api/                # OpenAPI 생성 API 클라이언트 (@repo/api)
  assets/             # 공유 정적 에셋 (@repo/assets)
  eslint-config/      # 공유 ESLint 설정 (@repo/eslint-config)
  typescript-config/  # 공유 tsconfig (@repo/typescript-config)
```

두 앱 모두 [FSD(Feature-Sliced Design)](https://feature-sliced.design) 레이어를 따른다:
`app → views → widget → features → entities → shared`.

## 실행

```bash
pnpm install
pnpm dev              # 모든 앱 동시 실행 (turbo)
pnpm --filter web dev     # web 만
pnpm --filter admin dev   # admin 만
```

## API 클라이언트 생성

백엔드(`http://localhost:8000`)가 떠 있는 상태에서:

```bash
pnpm --filter @repo/api regenerate
```
