# project/ — 프로젝트 특화 규칙

이 폴더는 **현재 프로젝트에서만 적용되는** 규칙을 담는다.

- `back/`, `common/`, `front/`, `task/` 폴더의 규칙은 **범용** — 다른 프로젝트에 복사해서 재사용 가능
- `project/` 폴더의 규칙은 **이 프로젝트 전용** — 다른 프로젝트에 복사하지 않음

## 어떤 내용을 넣는가

- 프로젝트 고유 도메인 용어 / 비즈니스 로직
- 프로젝트만의 아키텍처 결정 (예: 수집기 cron 규칙, 특정 외부 서비스 연동 패턴)
- 프로젝트 내 확정된 컨벤션 (예: 네이밍, 라벨링, URL 구조)
- 과거 의사결정 기록 (왜 이렇게 했는지)
- **공통 룰의 버전/옵션 오버라이드** (예: Tailwind v3 사용, Python 백엔드 등)

## 버전 오버라이드 예시

공통 룰은 기본값(최신 버전)을 따른다. 프로젝트가 다른 버전을 쓴다면 이 폴더에 명시.

```markdown
# project/tailwind.md
이 프로젝트는 Tailwind CSS v3을 사용한다.
front/tailwind-css.md의 "v3 전용" 섹션을 참고하고, "v4 전용" 섹션은 무시한다.
```

```markdown
# project/stack.md
- 프론트: Next.js 14 (App Router), Tailwind v3
- 백엔드: FastAPI (Python)
- DB: Supabase (Prisma 미사용)
→ back/nest.md, back/database.md 대신 back/fastapi.md, back/supabase.md 참고
```

## 다른 프로젝트에 rules 복사할 때

```
✅ 복사: back/, common/, front/, task/
❌ 복사 안 함: project/, CLAUDE.md
```

새 프로젝트에서 `project/` 폴더와 `CLAUDE.md` 는 해당 프로젝트에 맞게 새로 작성한다.
