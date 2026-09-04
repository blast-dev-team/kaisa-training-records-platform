---
description: "파일 및 변수 네이밍 컨벤션"
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---

# Naming Convention

## 파일 네이밍

### 기본 규칙

**모든 파일/폴더는 `kebab-case` 사용**

```
✅ good
user-profile/
use-user-data/
button-group.tsx
user-card.tsx
login-form.tsx

❌ bad
UserProfile/
useUserData/
buttonGroup.tsx
UserCard.tsx
LoginForm.tsx
```

### Hooks

**`use-` prefix + `camelCase`**

```
hooks/
  ✅ use-user-data.ts
  ✅ use-form-state.ts
  ✅ use-debounce.ts

  ❌ userData.ts
  ❌ useUserData.ts (파일명)
  ❌ form-state.ts
```

### 타입 파일

**`.types.ts` 또는 `.type.ts` 접미사**

```
model/
  ✅ user.types.ts
  ✅ product.type.ts
  ✅ api.types.ts

  ❌ UserTypes.ts
  ❌ user-type.ts (단수형)
```

### 테스트 파일

**대상 파일명 + `.test.` + 확장자**

```
button-group.tsx → button-group.test.tsx
use-user-data.ts → use-user-data.test.ts
api.ts → api.test.ts
```

### 폴더 구조

**FSD 아키텍처 예시**

```
src/
├── entities/
│   └── user/                    # kebab-case
│       ├── model/
│       │   ├── user.types.ts
│       │   └── user-detail.types.ts
│       ├── api/
│       │   ├── get-user-list.ts
│       │   ├── use-user-query.ts
│       │   └── user.test.ts
│       └── ui/
│           ├── user-card.tsx
│           └── user-card.test.tsx
├── features/
│   └── auth-login/               # kebab-case
│       ├── model/
│       ├── api/
│       └── ui/
│           ├── login-form.tsx
│           └── login-form.test.tsx
├── shared/
│   └── ui/
│       └── button/               # kebab-case
│           ├── button.tsx
│           └── button.test.tsx
```

## 변수/함수 네이밍

### 변수

**`camelCase` 사용**

```typescript
✅ good
const userName = '...';
const isActive = true;
const maxCount = 10;

❌ bad
const user_name = '...';
const IsActive = true;
const MAX_COUNT = 10; (const가 아니라면)
```

### 상수

**`UPPER_SNAKE_CASE` 사용**

```typescript
✅ good
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = 'https://...';
const DEFAULT_TIMEOUT = 5000;

❌ bad
const maxRetryCount = 3;
const apiBaseUrl = 'https://...';
```

### 함수

**`camelCase` + 동사로 시작**

```typescript
✅ good
function getUserData() { }
function handleSubmit() { }
function isValidEmail() { }

❌ bad
function userData() { }
function form_submit() { }
function ValidEmail() { }
```

### 인터페이스/타입

**`PascalCase` 사용**

```typescript
✅ good
interface UserProfile { }
type LoginFormData = { };
interface ApiResponse<T> { }

❌ bad
interface userProfile { }
type loginFormData = { }
```

### Enum

**`PascalCase` + 멤버는 `UPPER_SNAKE_CASE`**

```typescript
✅ good
enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  GUEST = 'GUEST',
}

❌ bad
enum userRole {
  admin = 'admin',
  USER = 'user',
}
```

## 중요

- **Always** use kebab-case for all files and folders (including components)
- **Always** use camelCase for variables and functions
- **Always** use UPPER_SNAKE_CASE for constants
- **Always** use PascalCase for types, interfaces, enums, and React component exports