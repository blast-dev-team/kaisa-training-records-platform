# 상담 메모 · 활동 이력 패널 규칙

상담일지(상담 메모 + 활동 이력 타임라인)는 **세 화면에서 동일한 패턴**으로 동작한다.
화면마다 미묘하게 규칙이 달라지면 상담사가 혼란스러우므로 아래 규칙을 공통으로 따른다.

## 적용 대상

| 화면 | 컴포넌트 |
|------|----------|
| 통합문의함 (문의 상세) | `views/inquiry-detail/ui/inquiry-body-panel.tsx` |
| 리드 상세 | `views/leads/ui/tabs/consulting-tab.tsx` |
| 계약 상세 | `views/deals-long-detail/ui/contract-memo-panel.tsx` |

> 셋은 현재 거의 동일한 코드를 복제하고 있다. 새 화면이 생기면 이 규칙을 따르고,
> 가능하면 입력창·필터 등 공통 조각은 `shared/ui` 컴포넌트/훅으로 재사용한다.

## 통일 규칙

### 1. 입력창

- `textarea` **auto-grow** — 내용 길이에 따라 자동으로 늘어난다 (최소 ~3줄, 최대 ~9줄 후 내부 스크롤).
  `shared/ui`의 `useAutosizeTextarea(ref, value)` 훅 사용. 고정 `rows`로 좁은 칸에 가두지 않는다.
- **Enter = 등록 / Ctrl(⌘)+Enter = 줄바꿈** — 의도된 정책. 그대로 유지한다.
  한글 IME 조합 중복 등록은 `e.nativeEvent.isComposing` 체크로 막는다.

### 2. 최소 글자수 — 제한 없음

- 글자수 하한을 두지 않는다. `trim()` 후 **빈 문자열만 차단**한다.
- 짧은 메모("부재", "콜백")도 바로 기록 가능해야 한다.
- (구) 리드 전용 "4자 이상" 규칙은 **폐지**. 화면별로 다른 하한을 두지 않는다.

### 3. 등록 버튼 문구

- 평상시 **"등록"**, 진행 중 **"등록 중..."** 으로 통일. ("저장 중..." 사용하지 않음)

### 4. 메모만 보기 토글

- 헤더 우측에 토글 배치. **기본값은 전체 표시**(상담 메모 + 활동 이력).
- 토글을 켜면 `kind === 'memo'` 만 남긴다 — 활동 로그가 많아도 상담 내용만 빠르게 훑을 수 있게.
- `shared/ui`의 `MemoOnlyToggle` 컴포넌트 사용.

### 5. "내 템플릿" 버튼

- 이 버튼은 **고객에게 보낼 문구를 클립보드로 복사**하는 도구다 (입력창 자동 삽입 아님).
  상담일지 작성용 스니펫이 아니라 고객 전달용이므로 현재 동작이 의도된 것이다.

### 6. "수정됨" 표시 — 활성화됨 (세 화면 공통)

- 메모를 수정하면 "· 수정됨" 이 노출된다. **문의·리드·계약 세 화면 모두 동작.**
- 구현: timeline API memo 항목이 `updated_at` 을 내려준다(`build_timeline`).
  공유 타입 `MemoTimelineItem.updated_at` 에 필드가 있고, 세 렌더러가 실제값을 사용한다.
  조건은 `updated_at !== created_at`.
- `contract_memo` 에 `updated_at` 컬럼을 추가했다(마이그레이션 `contract_memo_updated_at`,
  기존 row 는 `updated_at = created_at` 백필 → 가짜 "수정됨" 방지). `inquiry_memo`/`lead_memo`
  는 원래 컬럼 보유(insert 시 created_at 과 동일하게 채워짐).
- 향후 메모 카드/렌더러를 손볼 때 **세 화면 동시에** 적용한다. 한쪽만 바꿔 드리프트 내지 않는다.

## 리팩토링 메모 (미래 작업용)

> 현재는 surgical 하게 항목별로만 통일돼 있다. 화면별 규칙이 어긋났던 **근본 원인은
> 세 패널이 ~90% 복제된 중복 코드**라는 점이다. 아래 조각들은 아직 손으로 3곳을
> 맞춰야 하므로, 한쪽만 고치면 다시 어긋난다. 여유가 생기면 공통 컴포넌트로 추출한다.

### 중복 현황

> ⚠️ **아래 "3벌" 은 이제 6벌이다.** 2026-06-10 사고대차 CRM(#195)이 영업 3화면을
> 통째로 복사해 문의·리드·계약 패널이 각 2벌씩 됐다. 다만 **사고대차는 서비스 종료
> 예정이라 통합 범위에서 뺀다** → [accident-rent-sunset.md](accident-rent-sunset.md).
> 정리 대상은 **영업 3벌**(문의·리드·계약)이다.
>
> 복제가 실제로 낸 비용: 추후 연락(`follow_up_*` 4종)을 영업 리드에만 붙여서,
> 사고대차 리드에서는 같은 활동이 `님이 처리했어요` 로 뜬다.

| 조각 | 복제 수 | 비고 |
|------|---------|------|
| `MemoCard` | 3 | props 시그니처만 조금씩 다름 (inquiry/lead 는 `*Memo` 객체, contract 는 flat) |
| `TimelineItemRenderer` | 3 | stage dimming + kind 분기 로직 동일 |
| 입력창 composer 블록 (textarea + 버튼 row) | 3 | Enter/Ctrl+Enter, autosize, 등록 버튼 동일 |
| `ActivityUserChip`, `MemoAvatar` | 3 | 거의 동일 |
| `resolveActivityContent` + `ACTIVITY_ICONS`/`*_LABELS` 상수 | 3 | inquiry 는 케이스 일부 적음, lead/contract 는 사실상 동일 |
| `SalesLogCard`, `StageDivider` + `STAGE_TRANSITION_LABELS` | 2 | lead/contract |
| `ActivityRow` | — | **계약 패널만 로컬 재정의**, 나머지 2곳은 `shared/ui` 사용 → 우선 정리 대상 |

### 권장 추출 방향

- `shared/ui` 또는 `widgets/consultation-timeline` 에 공통 조각을 올린다:
  `MemoCard`, `TimelineItemRenderer`, `SalesLogCard`, `StageDivider`, `ActivityUserChip`,
  `resolveActivityContent` + 활동/상태 라벨 상수, 입력창 composer.
- 화면별로 **다른 부분만 props 로 주입**: 액션 버튼(전환/이탈/확정), mutation 엔드포인트
  (stage 라우팅), 권한(`canEdit`)·전환 상태(`isConverted`/`isChurned`), 빈/전환 시스템 메시지.
- 그러면 본 규칙(§1~§4)이 **코드 한 곳에 강제**돼 화면 간 드리프트가 구조적으로 불가능해진다.
- 우선순위가 낮은 quick win: 계약 패널의 로컬 `ActivityRow` 를 `shared/ui` 것으로 교체.
