# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. 서브에이전트·스킬 사용 — 기본은 직접

**기본값: 서브에이전트(Agent 툴 스폰)·오케스트레이션 없이 메인 컨텍스트에서 직접 처리한다.**

서브에이전트는 총 토큰을 크게 늘린다 — 스폰마다 rules 재주입 + 같은 파일 재-read + 장문 리포트 생성. 대부분의 기능개발·QA는 소~중 규모·명확해서 **직접이 더 싸고 품질 차이 없다**. 서브에이전트는 "총 토큰"이 아니라 "메인 컨텍스트 예산"을 아끼는 도구라, 소규모 단발 작업엔 오히려 낭비다.

스킬(`crm-feature`, `crm-qa-intake`)은 이 규율을 담은 **인컨텍스트 체크리스트**다 — 직접 따르며, 서브에이전트를 스폰하지 않는다. 서브에이전트(`general-purpose`) 스폰은 **다음 중 하나일 때만, 먼저 사용자에게 알리고**:
- 파일 여러 개 얽힌 **복잡한** 기능 → 넓은 코드베이스를 1회 병렬 탐색시켜 지도만 받아옴(메인 오염 방지)
- **틀리면 비싼** 변경 — 결제·정산·프로덕션·공용 코드 → **독립 검수**(작성자 편향 없는 fresh eyes — 인컨텍스트 self-verify로 대체 불가)

풀 파이프라인 같은 건 없다. **필요한 한 스텝만** 스폰한다(고위험 diff 1건만 독립 검수 등). trivial·명확한 건(문구·정렬·단일 필드·명확한 버그)은 무조건 직접.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
