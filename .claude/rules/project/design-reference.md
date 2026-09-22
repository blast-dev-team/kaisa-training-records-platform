# 디자인 레퍼런스 — WorldNIC 샘플

CRM 프론트엔드의 시각 디자인은 `ref/crm/design-sample-1` 의 WorldNIC
Bootstrap 어드민 템플릿을 **참고 디자인**으로 삼는다.

> 샘플은 Bootstrap 5 + jQuery 기반이므로 **HTML/CSS 를 그대로 복제하지 않는다**.
> 우리 스택은 Tailwind v4 + React + FSD. **디자인 언어(토큰·여백·패턴)만 이식**한다.

---

## 1. 폴더 위치

```
ref/crm/design-sample-1/
├── xhtml/              ← 실제 렌더링되는 HTML 페이지 100+ 개 (★ 주 참고)
│   ├── index.html        대시보드 메인
│   ├── dashboard-2.html  대시보드 변형
│   ├── ecom-customers.html, contact-list.html  ← 테이블 패턴
│   ├── edit-profile.html, app-profile.html     ← 상세/프로필 패턴
│   ├── project-list.html, kanban.html          ← 보드/리스트 패턴
│   ├── scss/
│   │   ├── abstracts/_variable.scss   ← 디자인 토큰 정의
│   │   ├── abstracts/_bs-custom.scss  ← Bootstrap 변수 (색·타이포)
│   │   └── components/                ← 컴포넌트별 스타일
│   └── css/style.css   ← 컴파일된 최종 CSS
└── doc/                ← 템플릿 문서 (참고용, 직접 안 봐도 됨)
```

## 2. UI 작업 시 워크플로우

비주얼 디자인을 건드리는 작업(컴포넌트 신규/리뉴얼, 페이지 레이아웃 변경)을 할 때:

1. 작업 대상과 유사한 패턴이 있는지 `xhtml/` 페이지를 먼저 본다
   - 대시보드/KPI → `index.html`
   - 테이블 리스트 → `ecom-customers.html`, `contact-list.html`
   - 상세 페이지 → `edit-profile.html`, `app-profile.html`
   - 모달/폼 → `ui-modal.html`, `form-element.html`, `form-wizard.html`
   - 칸반/보드 → `kanban.html`, `project-list.html`
2. 톤·여백·구성을 참고해 Tailwind 클래스로 옮긴다
3. 색·radius·shadow 는 우리 [globals.css](frontend/apps/crm-fe/src/styles/globals.css) 토큰을 그대로 사용 (샘플의 hex 값을 직접 박지 않는다)

## 3. 디자인 토큰 매핑

샘플 토큰 → 우리 프로젝트 변수 대응표. 새 컴포넌트 작성 시 이 매핑을 따른다.

| 샘플 | 우리 토큰 | 비고 |
|---|---|---|
| `$primary` `#0074FF` | `--color-accent` | 브랜드 포인트 컬러 |
| `$success` `#01BD9B` | `--color-ok` | OK·완료 상태 |
| `$warning` `#F09744` | `--color-warn` | 주의·진행중 |
| `$danger` `#D0412E` | `--color-danger` | 실패·이탈·삭제 |
| `$info` `#00afef` | `--color-info` | 정보·신규 |
| `$body-bg` `#F9F9FB` | `--color-bg` | 페이지 배경 |
| `$card` `#fff` | `--color-panel` | 카드 표면 |
| `$text-dark` `#10131e` | `--color-ink` | 본문 기본 텍스트 |
| `$text-gray` `#737B8B` | `--color-ink-2` | 보조 텍스트 |
| `$border` `#DEE1ED` | `--color-line` | 경계선 |
| `$radius-sm/$radius/$radius-lg` `4/8/12px` | `--radius-sm/md/lg` | 모서리 |
| `$shadow: 0 0 2.5rem rgba(82,63,105,0.1)` | (필요 시 추가) | 카드 shadow |

## 4. 핵심 패턴 — 빠른 참고

### Page Head
샘플 [`.page-head`](ref/crm/design-sample-1/xhtml/index.html) — 좌측 `h3` 제목 + 1줄 subtitle, 우측 outline + primary 액션.

```tsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h3 className="text-[20px] font-semibold text-ink">제목</h3>
    <p className="text-sm text-ink-3">한 줄 설명</p>
  </div>
  <div className="flex gap-2">
    <Button variant="outline">보조 액션</Button>
    <Button>주요 액션</Button>
  </div>
</div>
```

### KPI Card
샘플 `.ic-chart-card` — header에 작은 타이틀 + 우측 light badge(델타), body에 큰 숫자 + sparkline.
현재 [kpi-card.tsx](frontend/apps/crm-fe/src/shared/ui/kpi-card.tsx) 보다 한 단계 위 패턴.

```
┌─────────────────────────────────┐
│ Weekly Sales      [+2.7% ▲]    │  ← header (h6 + soft badge)
│                                 │
│ $92k                            │  ← data-value (큰 숫자)
│ ─────── sparkline ───────       │  ← chart slot
└─────────────────────────────────┘
```

### Soft Badge ("light" variant)
샘플 `.badge-{tone}.light` — 톤별 soft 배경 + 강조 텍스트. `Pill`/`Chip` 의 기본 시각 스타일.

```
badge-success light  → bg: success @ 10% opacity, text: success
badge-info light     → bg: info @ 10% opacity, text: info
```

우리 [pill.tsx](frontend/apps/crm-fe/src/shared/ui/pill.tsx) 의 톤 시스템이 이 역할.

### Table Row
샘플 `ecom-customers.html` — 행 내부:
- 첫 컬럼: 아바타 + `<span>이름</span><span class="fs-12">보조</span>` 2줄
- 상태 컬럼: light badge
- 마지막 컬럼: 점 3개 dropdown 메뉴
행 여백은 `1rem` 안팎으로 우리보다 조금 넉넉.

## 5. 하지 말 것

- 샘플의 hex 값을 클래스에 직접 박기 (`bg-[#0074FF]` 등). 항상 토큰 경유.
- 샘플 HTML 클래스명(`card`, `badge-sm light`)을 그대로 옮기기. Tailwind 클래스로 재작성.
- 샘플의 jQuery/Bootstrap 컴포넌트(swiper, datatables, jqvmap)를 흉내내려고 같은 라이브러리 도입. 우리 스택(TanStack Table 등) 안에서 시각만 비슷하게.
- 샘플 사이드바(평면 1-depth)에 맞춰 우리 3-depth rail+panel 구조를 부수기. 구조는 유지, 시각만 정렬.

## 6. 점진 적용 원칙

전체를 한 번에 리뉴얼하지 않는다. 작업 대상 페이지/컴포넌트 단위로 샘플과 비교 → 토큰·패턴만 조정. PR 단위는 작게:

- 토큰 조정 PR (radius/색/shadow)
- 공통 컴포넌트 1개 리뉴얼 PR (KPI, Card, Badge 등)
- 뷰별 리뉴얼 PR (대시보드, 리스트, 상세 …)

> 새 패턴이 정착하면 본 룰의 §4(핵심 패턴) 섹션에 추가한다.
