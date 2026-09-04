---
description: "Tailwind CSS 사용 규칙. 기본값은 v4. v3 프로젝트는 project/tailwind.md에 버전 명시."
paths:
  - "**/*.tsx"
  - "**/*.css"
---

# Tailwind CSS 규칙

> **기본 버전: v4**
> v3 프로젝트라면 `project/tailwind.md` 에 명시 → 해당 섹션만 참고

---

## 공통 (v3 / v4 동일)

### Arbitrary Value

표준 스케일(4, 8, 12, 16...)로 표현 안 될 때만 사용.
반복되는 arbitrary value는 컴포넌트나 CSS 변수로 추출 검토.

```
❌ border-3     →  ✅ border-[3px]
❌ z-999        →  ✅ z-[999]
```

```tsx
// ✅ 표준 스케일 우선
className="px-4 py-2 rounded-lg"

// ✅ 불가피한 경우만
className="h-[200px] w-[280px]"

// ❌ 남용
className="px-[17px] py-[9px] mt-[13px]"
```

### 반응형

모바일 퍼스트 기본, `md:` breakpoint로 데스크탑 대응.

```tsx
className="px-4 md:px-6"
className="hidden md:block"
className="flex-col md:flex-row"
```

### 조건부 클래스

```tsx
// 단순한 경우 - 템플릿 리터럴
className={`px-3 py-1.5 ${isActive ? "bg-blue-500 text-white" : "bg-white"}`}

// 복잡한 경우 - clsx 또는 cn 유틸
className={cn("px-3 py-1.5", isActive && "bg-blue-500 text-white", isDisabled && "opacity-50")}
```

### 커스텀 글로벌 스타일

반드시 `@layer base {}` 안에 작성.
unlayered 스타일은 Tailwind 유틸리티보다 cascade 우선순위가 높아 `px-*`, `py-*` 등이 무시됨.

```css
/* ✅ */
@layer base {
  * { box-sizing: border-box; }
}

/* ❌ */
* { padding: 0; margin: 0; }
```

### 금지 사항

- ❌ `@apply` 남용
- ❌ globals.css에 unlayered 커스텀 스타일
- ❌ 동적 레이아웃 값을 제외한 `style={}` 과 Tailwind 혼용

---

## v4 전용

### 기본 설정

```css
@import "tailwindcss";
```

### 디자인 토큰 — `@theme`

`@theme` 블록으로 CSS 변수를 Tailwind 클래스로 바로 사용 가능.

```css
@import "tailwindcss";

@theme inline {
  --color-primary: #3b82f6;
  --color-surface: #0f172a;
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}
```

```tsx
className="bg-primary text-surface font-sans"
```

### CSS 중첩 (Nesting)

v4는 네이티브 CSS 중첩을 지원한다.

```css
@layer base {
  .prose {
    h1 { font-size: 1.875rem; font-weight: 700; }
    p  { color: #d1d5db; line-height: 1.8; }
  }
}
```

---

## v3 전용

### 기본 설정

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 디자인 토큰 — `tailwind.config.js`

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        surface: '#0f172a',
      },
      fontFamily: {
        sans: ['Geist', 'sans-serif'],
      },
    },
  },
}
```

### v3에서 주의할 점

- `border-3`, `z-999` 등 비표준 클래스는 arbitrary value로 대체 (공통 규칙과 동일)
- JIT 모드 기본 활성화 (v3.2+), 동적 클래스는 safelist 또는 전체 문자열로 작성

---

## v3 vs v4 주요 차이 요약

| | v3 | v4 |
|---|---|---|
| CSS import | `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| 커스텀 토큰 | `tailwind.config.js` → `theme.extend` | `@theme {}` 블록 |
| CSS 중첩 | 미지원 (PostCSS 플러그인 필요) | 네이티브 지원 |
| 설정 파일 | 필수 (`tailwind.config.js`) | 선택 (CSS만으로 가능) |
