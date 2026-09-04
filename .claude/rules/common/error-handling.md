---
description: "에러 처리 공통 원칙 — 메시지 기준, 사용자 노출 수준, 레이어별 책임"
---

# Error Handling Guidelines

## 기본 원칙

- 에러는 **발생한 레이어**에서 처리하거나, 처리할 수 없으면 위로 전파
- 사용자에게는 항상 **의미 있는 피드백** 제공
- 에러를 조용히 삼키는 빈 `catch` 금지
- 내부 구현 세부사항(스택 트레이스, DB 쿼리, 내부 경로)은 절대 노출 금지

## 에러 메시지 기준

### 사용자 노출 메시지

- **한국어** 로 작성 (서비스 언어에 맞게)
- 원인 + 다음 행동 안내 포함
- 유저 탓처럼 느껴지지 않게

```
❌ "Error 500"
❌ "잘못된 요청입니다"
❌ "DB connection failed"

✅ "문제가 생겼어요. 잠시 후 다시 시도해 주세요"
✅ "URL 형식을 확인해 주세요 (예: https://myapp.com)"
✅ "이미 사용 중인 이메일이에요"
```

### 개발자용 로그 메시지

- 영어 또는 한국어 무관, 디버깅에 필요한 정보 포함
- 서버 로그에만 기록, 응답에 포함하지 않음

## 레이어별 책임

### 백엔드 API

- 비즈니스 에러: 적절한 HTTP 상태코드 + 한국어 메시지
- 예상치 못한 에러: `500` + 일반적인 메시지, 상세 내용은 서버 로그
- 프레임워크별 패턴은 `back/nest.md`, `back/fastapi.md`, `back/django.md` 참고

### 프론트엔드

- API 에러: catch 후 사용자에게 토스트 또는 인라인 메시지
- 빈 catch 금지 — 최소한 `console.error` + 사용자 피드백

```typescript
// ✅
try {
  await submitForm(data)
} catch (error) {
  const message = error instanceof Error ? error.message : '문제가 생겼어요'
  setErrorMessage(message)
}

// ❌
try {
  await submitForm(data)
} catch {}
```

## 에러 분류

| 종류 | HTTP | 처리 방법 |
|------|------|-----------|
| 입력값 오류 | 400 | 폼 필드 옆 인라인 메시지 |
| 인증 필요 | 401 | 로그인 페이지로 리다이렉트 |
| 권한 없음 | 403 | "접근 권한이 없어요" 안내 |
| 없는 리소스 | 404 | 빈 상태 UI 또는 not-found 페이지 |
| 서버 오류 | 500 | "잠시 후 다시 시도해 주세요" + 재시도 버튼 |

## catch절 타입

`catch`절의 에러는 항상 `unknown`으로 처리. (`typescript-standards.md` 참고)

```typescript
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : '알 수 없는 오류'
}
```

## 금지 사항

- 빈 catch (`catch {}`, `catch { return }`)
- `console.error`만 하고 사용자 피드백 없음
- 에러 메시지에 스택 트레이스, DB 에러, 내부 경로 노출
- 모든 에러를 동일하게 처리 (404와 500은 다르게 처리)
