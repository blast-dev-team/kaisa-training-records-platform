---
name: crm-feature
description: "공카 CRM 기능을 기획→개발→검수 규율로 만드는 인컨텍스트 체크리스트. 기본은 메인 컨텍스트에서 직접 따른다(서브에이전트 스폰 안 함). '기능 만들어줘', 'X 기획부터 개발까지', '새 도메인 추가' 같은 요청 시 이 순서를 따른다. general-purpose 서브에이전트 스폰은 파일 여러 개 얽힌 복잡한 기능(넓은 탐색)이거나 결제·정산·프로덕션·공용코드처럼 틀리면 비싼 변경(독립 검수)일 때만, 사용자에게 먼저 알리고."
---

# CRM Feature — 기획→개발→검수 (기본: 직접)

기능 하나를 **기획·개발·검수 규율**로 만든다. **기본은 이 컨텍스트에서 직접** 따른다 —
서브에이전트를 스폰하지 않는다(그게 토큰을 크게 늘림, `.claude/CLAUDE.md §5`).

## 흐름 (직접 따르는 체크리스트)

### ① 기획 / 스코프 확정
- 요구사항이 모호하면 **질문 먼저**(`AskUserQuestion`). 해석 여러 개면 나열, 조용히 고르지 않기.
- 기존 코드·PRD·스키마를 먼저 파악(재발명 금지).
- 1차 범위 / 다음 버전을 가른다. 단순함 우선(요청 이상 설계 X).
- **DB 변경**은 `.claude/rules/project/db-planning.md` 승인 게이트 — 이유 설명 → 사용자 승인 → 진행. 승인 전엔 설계만.
- PRD 도메인이면 `.claude/rules/project/prd-workflow.md` 따라 `docs/crm/prd/` 갱신.

### ② 승인 게이트
- 스키마 변경·큰 범위는 사용자 확인. 승인 없이 스키마 안 건드림.

### ③ 개발
- **기존 도메인 패턴 미러링**(새 컨벤션 발명 금지). 레퍼런스: 백엔드 `department`, 프론트 `entities/department`+`views/departments`.
- 규칙: `back/fastapi.md`·`api-design.md`, `front/fsd-architecture.md`·`entities-layer.md`·`pagination.md`·`url-state.md`·`tailwind-css.md`, `common/*`.
- Surgical — 요청과 무관한 코드 안 건드림. 작업 전 `git pull` + 대상 Read(`collaboration.md`).
- 마이그레이션은 autogenerate 드리프트 검토 후 내 변경만 남김.

### ④ 검수 (self-verify)
- FE `pnpm check-types`, BE import·라우트 확인. 핵심 경로·엣지케이스를 **스크래치 스크립트로 직접 검증**.
- 스키마 변경 시 `docs/db-schema.md`·`db-diagram.dbml` 동기화.

### ⑤ 마무리
- 무엇을 어떻게 검증했는지 요약. **커밋은 사용자가 요청할 때만**(`project/git-commit.md`, dev 기준 feat 브랜치).

## 서브에이전트로 올릴 때만 (예외)
`general-purpose` 서브에이전트를 아래일 때만, **사용자에게 먼저 알리고**, **필요한 한 스텝만** 스폰한다:
- 파일 여러 개 얽힌 **복잡한** 기능 → 넓은 코드베이스 1회 병렬 탐색(지도만 받아옴, 메인 오염 방지).
- **틀리면 비싼** 변경(결제·정산·프로덕션·공용코드) → **독립 검수**(작성자 편향 없는 fresh eyes — 인컨텍스트 self-verify로 대체 불가). 스폰 시 `model: opus` + 아래 지시:
  - **적대적으로**: 확인하려 말고 반증하려 접근. 확신 없으면 재현·검증 후 보고, **오탐 금지**.
  - **두 렌즈**: ① 정확성/버그/엣지케이스(실패 시나리오 재현) ② 컨벤션 준수(`.claude/rules/*`·마이그레이션 드리프트).
  - **심각도순** 보고(blocker>major>minor) + 파일:라인. 진단만, 수정은 메인이.

## 참고
- 규율의 상당 부분은 이미 `.claude/rules/*`(항상 로드)에 있음. 이 스킬은 그 **순서를 강제하는 체크리스트**.
