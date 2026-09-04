---
description: "컴포넌트 설계 원칙 - 분할 기준, Props 설계, 합성 패턴"
paths:
  - "**/*.tsx"
---

# Component Design

## 컴포넌트 분할 기준

다음 중 하나라도 해당하면 분할한다:
- 100줄 이상이고 내부에 명확히 구분되는 역할이 있을 때
- 동일한 UI 블록이 2곳 이상에서 반복될 때
- 비즈니스 로직이 JSX와 섞여 읽기 어려울 때

단순히 길다는 이유만으로 분할하지 않는다. 짧더라도 재사용성이 없으면 분리할 필요 없다.

## Props 설계

### 네이밍
- 이벤트 핸들러: `on` 접두사 (`onClick`, `onSubmit`, `onClose`)
- boolean: `is`, `has`, `can` 접두사 (`isOpen`, `hasError`, `canEdit`)
- 렌더 커스터마이징: `render` 접두사 또는 `children`

### 최소화
컴포넌트에 필요한 props만 받는다. 상위에서 모든 것을 내려주는 prop drilling은 Context나 합성으로 해결한다.

```tsx
// ❌ 불필요하게 많은 props
<Button label="저장" icon="save" size="md" variant="primary" isLoading={false} isDisabled={false} />

// ✅ 명확하게 필요한 것만
<Button variant="primary" isLoading={isSaving}>저장</Button>
```

### Optional props 기본값
선택적 props는 기본값을 컴포넌트 선언부에서 지정한다.

```tsx
function Card({ title, variant = "default", showBorder = true }: CardProps) { ... }
```

## 합성 패턴

복잡한 컴포넌트는 합성(Composition)으로 확장성을 확보한다.

```tsx
// ✅ children으로 내부 콘텐츠를 유연하게
<Modal>
  <Modal.Header>제목</Modal.Header>
  <Modal.Body>내용</Modal.Body>
  <Modal.Footer>
    <Button onClick={onClose}>닫기</Button>
  </Modal.Footer>
</Modal>
```

## 순수성 유지

컴포넌트는 같은 props에 같은 결과를 렌더링해야 한다.
side effect는 `useEffect`나 이벤트 핸들러 안에서만 처리한다.

## 금지 사항

- props 이름에 구현 세부사항 노출 (`setIsModalVisible` → `onClose`)
- 컴포넌트 내에서 직접 API 호출 (커스텀 훅으로 분리)
- 과도한 prop drilling (3단계 이상이면 Context 또는 합성 검토)
